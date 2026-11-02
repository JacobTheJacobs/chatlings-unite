"""Read visible X11 window geometry using libwnck. Never reads window titles/pixels."""
import os
import gi
gi.require_version('Wnck', '3.0')
from gi.repository import Wnck
from physics import visible_edges

class WindowSurfaces:
    def __init__(self, origin_x, origin_y, width, height):
        self.origin_x, self.origin_y = origin_x, origin_y
        self.width, self.height = width, height
        self.screen = Wnck.Screen.get_default()
        self.count = 0

    def scan(self):
        self.screen.force_update()
        workspace = self.screen.get_active_workspace()
        windows = []
        for win in self.screen.get_windows_stacked():
            if win.get_pid() == os.getpid() or win.is_minimized(): continue
            if workspace and not win.is_visible_on_workspace(workspace): continue
            if win.get_window_type() not in (Wnck.WindowType.NORMAL, Wnck.WindowType.DIALOG, Wnck.WindowType.UTILITY): continue
            x, y, w, h = win.get_geometry()
            x -= self.origin_x; y -= self.origin_y
            if w < 30 or h < 20 or x+w <= 0 or y+h <= 0 or x >= self.width or y >= self.height: continue
            windows.append((win.get_xid(), x, y, w, h))
        self.count = len(windows)
        return visible_edges(windows, self.width, self.height)
