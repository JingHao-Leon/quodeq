"""macOS Dock / Cmd-Tab display name for the unbundled webview process.

Running from a venv (``quodeq --dev``, pip, Homebrew) the webview is a bare
``python3.x`` process with no ``.app`` bundle, so LaunchServices registers it
under the interpreter's executable name and the Dock tooltip reads
"python3.14". Patching ``CFBundleName`` in the in-memory bundle dict fixes the
menu bar (AppKit reads it lazily) but not the Dock, which reads the name
LaunchServices recorded at registration.

``_LSSetApplicationInformationItem`` rewrites that registered display name for
the current process. It is private API (Chromium uses it to name its helper
processes), so every step is best-effort: a missing symbol or a non-zero
status is logged at debug level and the process keeps the default name.
"""
from __future__ import annotations

import ctypes

from quodeq.shared.logging import log_debug

__all__ = ["set_dock_display_name"]

_CORE_SERVICES = "/System/Library/Frameworks/CoreServices.framework/CoreServices"
_CORE_FOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
_K_LS_DEFAULT_SESSION_ID = -2  # LSSessionID kLSDefaultSessionID
_K_CF_STRING_ENCODING_UTF8 = 0x08000100


def _load_launch_services() -> tuple[ctypes.CDLL, ctypes.CDLL]:
    """Load CoreServices + CoreFoundation and declare the signatures we call."""
    ls = ctypes.CDLL(_CORE_SERVICES)
    cf = ctypes.CDLL(_CORE_FOUNDATION)
    ls._LSGetCurrentApplicationASN.restype = ctypes.c_void_p
    ls._LSGetCurrentApplicationASN.argtypes = []
    ls._LSSetApplicationInformationItem.restype = ctypes.c_int32
    ls._LSSetApplicationInformationItem.argtypes = [
        ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
    ]
    cf.CFStringCreateWithCString.restype = ctypes.c_void_p
    cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
    cf.CFRelease.restype = None
    cf.CFRelease.argtypes = [ctypes.c_void_p]
    return ls, cf


def set_dock_display_name(name: str) -> None:
    """Set the Dock tooltip / Cmd-Tab name of the current process to *name*."""
    try:
        ls, cf = _load_launch_services()
        display_name_key = ctypes.c_void_p.in_dll(ls, "_kLSDisplayNameKey").value
    except (OSError, AttributeError, ValueError) as exc:
        log_debug(f"dock name skipped, LaunchServices unavailable: {exc}")
        return
    asn = ls._LSGetCurrentApplicationASN()
    if not asn or not display_name_key:
        log_debug("dock name skipped: process not registered with LaunchServices")
        return
    value = cf.CFStringCreateWithCString(None, name.encode("utf-8"), _K_CF_STRING_ENCODING_UTF8)
    if not value:
        return
    try:
        status = ls._LSSetApplicationInformationItem(
            _K_LS_DEFAULT_SESSION_ID, asn, display_name_key, value, None,
        )
    finally:
        cf.CFRelease(value)
    if status != 0:
        log_debug(f"dock name not set: LaunchServices status {status}")
