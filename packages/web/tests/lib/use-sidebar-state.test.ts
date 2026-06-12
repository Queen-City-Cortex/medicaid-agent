import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarState } from '@/lib/use-sidebar-state';

let storage: Map<string, string>;
let setItemSpy: ReturnType<typeof vi.fn>;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

function setup(isMobile: boolean) {
  return renderHook(({ mobile }) => useSidebarState({ isMobile: mobile }), {
    initialProps: { mobile: isMobile },
  });
}

describe('useSidebarState', () => {
  beforeEach(() => {
    storage = new Map<string, string>();
    setItemSpy = vi.fn((key: string, value: string) => {
      storage.set(key, value);
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: setItemSpy,
        removeItem: vi.fn((key: string) => {
          storage.delete(key);
        }),
      },
    });
    setWindowWidth(1024);
  });

  it('starts expanded on desktop when nothing is persisted', () => {
    const { result } = setup(false);
    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('restores the persisted collapsed state on desktop', () => {
    storage.set('sidebar-collapsed', 'true');
    const { result } = setup(false);
    expect(result.current.sidebarCollapsed).toBe(true);
  });

  it('starts collapsed on small windows regardless of the persisted value', () => {
    storage.set('sidebar-collapsed', 'false');
    setWindowWidth(375);
    const { result } = setup(true);
    expect(result.current.sidebarCollapsed).toBe(true);
  });

  it('toggleSidebar flips and persists the state', () => {
    const { result } = setup(false);

    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(setItemSpy).toHaveBeenCalledWith('sidebar-collapsed', 'true');

    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(setItemSpy).toHaveBeenLastCalledWith('sidebar-collapsed', 'false');
  });

  it('closeMobileSidebar collapses on mobile WITHOUT persisting (auto-close, not a user choice)', () => {
    setWindowWidth(375); // start collapsed
    const { result } = setup(true);
    // Expand first (toggle persists, so clear the spy after).
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(false);
    setItemSpy.mockClear();

    act(() => result.current.closeMobileSidebar());

    expect(result.current.sidebarCollapsed).toBe(true);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('closeMobileSidebar is a no-op on desktop', () => {
    const { result } = setup(false);
    expect(result.current.sidebarCollapsed).toBe(false);

    act(() => result.current.closeMobileSidebar());

    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('Escape collapses the open mobile sidebar and persists it', () => {
    setWindowWidth(375); // start collapsed
    const { result } = setup(true);
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(false);
    setItemSpy.mockClear();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.sidebarCollapsed).toBe(true);
    expect(setItemSpy).toHaveBeenCalledWith('sidebar-collapsed', 'true');
  });

  it('Escape does nothing on desktop', () => {
    const { result } = setup(false);
    expect(result.current.sidebarCollapsed).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('other keys do not close the mobile sidebar', () => {
    setWindowWidth(375); // start collapsed
    const { result } = setup(true);
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(result.current.sidebarCollapsed).toBe(false);
  });
});
