/* Original C4 source bytes, loaded on demand from static resource packs. */
(function (root) {
  'use strict';
  const PACK_LIMIT = 20 * 1024 * 1024;

  class C4ResourceReader {
    constructor(meta, baseURL) {
      if (!meta || meta.version !== 1 || !meta.sources || !meta.pages) {
        throw new Error('فهرس موارد المشروع غير صالح.');
      }
      this.meta = meta;
      this.baseURL = new URL(baseURL || meta.base_url || root.document?.baseURI || root.location?.href).href;
      this.cache = new Map();
      this.pending = new Map();
      this.generation = 0;
    }

    clear() {
      this.generation += 1;
      this.cache.clear();
    }

    source(id) {
      const descriptor = this.meta.sources[id];
      if (!descriptor) return Promise.reject(new Error('مرجع ملف المخطط غير موجود: ' + id));
      return this.read(descriptor);
    }

    page(id, kind) {
      if (kind !== 'drawings' && kind !== 'text') {
        return Promise.reject(new Error('نوع مورد اللوحة غير صالح.'));
      }
      const descriptor = this.meta.pages[id]?.[kind];
      if (!descriptor) return Promise.reject(new Error('مرجع بيانات اللوحة غير موجود: ' + id));
      return this.read(descriptor);
    }

    async read(descriptor) {
      if (!descriptor || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0 ||
          !Array.isArray(descriptor.parts) || !/^[a-f0-9]{64}$/i.test(descriptor.sha256 || '')) {
        throw new Error('وصف مورد المشروع غير صالح.');
      }
      let total = 0;
      for (const part of descriptor.parts) {
        this._validatePart(part);
        total += part.length;
      }
      if (total !== descriptor.bytes) throw new Error('حجم أجزاء المورد لا يطابق الفهرس.');
      const result = new Uint8Array(descriptor.bytes);
      let position = 0;
      for (const part of descriptor.parts) {
        if (!part.length) continue;
        const bytes = await this._part(part);
        result.set(bytes, position);
        position += bytes.length;
      }
      if (!root.crypto?.subtle) throw new Error('يلزم اتصال HTTPS للتحقق من ملفات المشروع.');
      const digest = await root.crypto.subtle.digest('SHA-256', result);
      const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      if (actual !== descriptor.sha256.toLowerCase()) throw new Error('بصمة مورد المشروع لا تطابق المصدر.');
      return result;
    }

    _validatePart(part) {
      if (!part || typeof part.path !== 'string' || !/^[A-Za-z0-9_.-]+\.bin$/.test(part.path) ||
          !Number.isSafeInteger(part.offset) || !Number.isSafeInteger(part.length) ||
          part.offset < 0 || part.length < 0 || part.offset + part.length > PACK_LIMIT) {
        throw new Error('مرجع جزء المورد غير صالح.');
      }
    }

    _cached(path, start, end) {
      const entry = this.cache.get(path);
      if (!entry || start < entry.start || end > entry.end) return null;
      this.cache.delete(path);
      this.cache.set(path, entry);
      return entry.bytes.subarray(start - entry.start, end - entry.start);
    }

    _remember(path, entry) {
      const existing = this.cache.get(path);
      if (existing && existing.start <= entry.start && existing.end >= entry.end) entry = existing;
      this.cache.delete(path);
      this.cache.set(path, entry);
      while (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value);
    }

    async _part(part) {
      const start = part.offset, end = start + part.length;
      const cached = this._cached(part.path, start, end);
      if (cached) return cached;
      let flight = this.pending.get(part.path);
      if (!flight) {
        flight = {start, end, started: false, generation: this.generation};
        flight.promise = new Promise((resolve, reject) => {
          flight.resolve = resolve;
          flight.reject = reject;
        });
        this.pending.set(part.path, flight);
        queueMicrotask(async () => {
          flight.started = true;
          try {
            const entry = await this._request(part.path, flight.start, flight.end);
            if (flight.generation === this.generation) this._remember(part.path, entry);
            flight.resolve(entry);
          } catch (error) {
            flight.reject(error);
          } finally {
            if (this.pending.get(part.path) === flight) this.pending.delete(part.path);
          }
        });
      } else if (!flight.started) {
        flight.start = Math.min(flight.start, start);
        flight.end = Math.max(flight.end, end);
      }
      if (start >= flight.start && end <= flight.end) {
        const entry = await flight.promise;
        return entry.bytes.subarray(start - entry.start, end - entry.start);
      }
      // A different range arrived after this pack's request started. Reuse a
      // complete 200 response, or queue one merged follow-up after the 206.
      await flight.promise;
      return this._part(part);
    }

    async _request(path, start, end) {
      const url = new URL(path, this.baseURL);
      const response = await root.fetch(url.href, {headers: {Range: `bytes=${start}-${end - 1}`}});
      if (response.status !== 200 && response.status !== 206) {
        throw new Error('تعذر تحميل مورد المشروع: HTTP ' + response.status);
      }
      let responseStart = 0;
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('Content-Range') || '');
        if (!range || Number(range[1]) !== start || Number(range[2]) !== end - 1 ||
            Number(range[3]) < end || Number(range[3]) > PACK_LIMIT) {
          throw new Error('نطاق المورد المستلم لا يطابق الطلب.');
        }
        responseStart = start;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > PACK_LIMIT ||
          (response.status === 206 && bytes.length !== end - start) ||
          (response.status === 200 && bytes.length < end)) {
        throw new Error('حجم المورد المستلم لا يطابق الطلب.');
      }
      return {start: responseStart, end: responseStart + bytes.length, bytes};
    }
  }
  root.C4ResourceReader = C4ResourceReader;
})(globalThis);
