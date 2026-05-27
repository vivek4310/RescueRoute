/**
 * MinHeap — keyed by numeric priority.
 * O(log n) push / pop instead of O(n log n) sort.
 */
export class MinHeap {
  constructor() { this._h = []; }

  get size() { return this._h.length; }

  push(priority, value) {
    this._h.push({ priority, value });
    this._bubbleUp(this._h.length - 1);
  }

  pop() {
    const top = this._h[0];
    const last = this._h.pop();
    if (this._h.length > 0) {
      this._h[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._h[p].priority <= this._h[i].priority) break;
      [this._h[p], this._h[i]] = [this._h[i], this._h[p]];
      i = p;
    }
  }

  _siftDown(i) {
    const n = this._h.length;
    while (true) {
      let min = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this._h[l].priority < this._h[min].priority) min = l;
      if (r < n && this._h[r].priority < this._h[min].priority) min = r;
      if (min === i) break;
      [this._h[min], this._h[i]] = [this._h[i], this._h[min]];
      i = min;
    }
  }
}
