import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rafThrottle } from '../src/utils/rafThrottle';

describe('rafThrottle', () => {
  let queue: FrameRequestCallback[] = [];
  beforeEach(() => {
    queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue[id - 1] = () => {}; });
  });
  afterEach(() => vi.unstubAllGlobals());
  const frame = () => { const q = queue; queue = []; q.forEach((cb) => cb(0)); };

  it('calls once per frame with the latest arguments', () => {
    const fn = vi.fn();
    const t = rafThrottle(fn);
    t(1); t(2); t(3);
    expect(fn).not.toHaveBeenCalled();
    frame();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('flush runs the pending call at once, cancel drops it', () => {
    const fn = vi.fn();
    const t = rafThrottle(fn);
    t('a'); t.flush();
    expect(fn).toHaveBeenCalledWith('a');
    t('b'); t.cancel(); frame();
    expect(fn).toHaveBeenCalledTimes(1);
    t.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
