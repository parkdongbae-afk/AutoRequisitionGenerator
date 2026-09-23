#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
확장 프로그램 개발자 모드 및 자동 설치 v18.1

Chrome / Edge / Whale의 실제 확장 프로그램 관리 화면을 Windows UI Automation으로
확인하고 개발자 모드를 변경합니다.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import tkinter as tk
import tkinter.font as tkfont
from dataclasses import dataclass
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk
from typing import Any, Iterable

try:
    import psutil
except ImportError:
    psutil = None

try:
    from pywinauto import Desktop
    from pywinauto.keyboard import send_keys
except ImportError:
    Desktop = None
    send_keys = None


APP_NAME = "확장 프로그램 개발자 모드 및 자동 설치"
APP_VERSION = "18.1.0"

BG = "#F3F6FA"
CARD = "#FFFFFF"
NAVY = "#0F172A"
TEXT = "#1E293B"
MUTED = "#64748B"
BORDER = "#DCE3EC"
BLUE = "#2563EB"
BLUE_HOVER = "#1D4ED8"
GREEN = "#059669"
RED = "#DC2626"


@dataclass(frozen=True)
class BrowserSpec:
    key: str
    display_name: str
    process_names: tuple[str, ...]
    default_user_data_paths: tuple[Path, ...]
    scheme: str


@dataclass
class Profile:
    browser: BrowserSpec
    user_data_dir: Path
    directory_name: str
    display_name: str
    preferences_path: Path
    is_last_used: bool = False
    source: str = "자동 검색"
    actual_state: bool | None = None
    status_message: str = "확인 필요"

    @property
    def identity(self) -> str:
        try:
            value = str(self.preferences_path.resolve())
        except OSError:
            value = str(self.preferences_path.absolute())
        if platform.system() == "Windows":
            value = value.lower()
        return f"{self.browser.key}|{value}"


def unique_paths(paths: Iterable[Path]) -> tuple[Path, ...]:
    result: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        path = path.expanduser()
        key = str(path).lower() if platform.system() == "Windows" else str(path)
        if key not in seen:
            seen.add(key)
            result.append(path)
    return tuple(result)


def browser_specs() -> tuple[BrowserSpec, ...]:
    roots: list[Path] = []
    for value in (
        os.environ.get("LOCALAPPDATA"),
        str(Path.home() / "AppData/Local"),
    ):
        if value:
            roots.append(Path(value))
    roots = list(unique_paths(roots))

    return (
        BrowserSpec(
            "chrome",
            "Google Chrome",
            ("chrome.exe",),
            unique_paths(root / "Google/Chrome/User Data" for root in roots),
            "chrome",
        ),
        BrowserSpec(
            "edge",
            "Microsoft Edge",
            ("msedge.exe",),
            unique_paths(root / "Microsoft/Edge/User Data" for root in roots),
            "edge",
        ),
        BrowserSpec(
            "whale",
            "NAVER Whale",
            ("whale.exe",),
            unique_paths(
                path
                for root in roots
                for path in (
                    root / "Naver/Naver Whale/User Data",
                    root / "Naver/Whale/User Data",
                )
            ),
            "whale",
        ),
    )


def app_data_dir() -> Path:
    root = Path(os.environ.get("APPDATA", str(Path.home())))
    path = root / "ExtensionDeveloperModeManager"
    path.mkdir(parents=True, exist_ok=True)
    return path


def config_path() -> Path:
    return app_data_dir() / "config.json"


def diagnostic_dir() -> Path:
    path = app_data_dir() / "diagnostics"
    path.mkdir(parents=True, exist_ok=True)
    return path


def bundled_resource_path(relative_path: str) -> Path:
    """소스 실행과 PyInstaller onefile 실행에서 공통으로 리소스를 찾습니다."""
    bundle_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return bundle_root / relative_path


def validate_extension_directory(path: Path) -> tuple[bool, str, str]:
    """압축 해제된 확장 프로그램 폴더와 manifest.json을 검사합니다."""
    path = path.expanduser()
    if not path.is_dir():
        return False, "", "익스텐션 폴더가 존재하지 않습니다."

    manifest_path = path / "manifest.json"
    if not manifest_path.is_file():
        return False, "", "선택한 폴더에 manifest.json이 없습니다."

    try:
        manifest = load_json(manifest_path)
    except Exception as exc:
        return False, "", f"manifest.json을 읽지 못했습니다: {exc}"

    manifest_version = manifest.get("manifest_version")
    if manifest_version not in (2, 3):
        return False, "", "manifest_version은 2 또는 3이어야 합니다."

    name = manifest.get("name")
    version = manifest.get("version")
    if not isinstance(name, str) or not name.strip():
        return False, "", "manifest.json의 name이 올바르지 않습니다."
    if not isinstance(version, str) or not version.strip():
        return False, "", "manifest.json의 version이 올바르지 않습니다."

    return True, name.strip(), f"{name.strip()} v{version.strip()}"


def prepare_bundled_test_extension() -> Path:
    """번들된 테스트 익스텐션을 영구 폴더로 복사합니다.

    onefile EXE의 임시 압축 해제 경로는 프로그램 종료 후 사라지므로,
    브라우저가 계속 참조할 수 있는 APPDATA 하위 폴더를 사용합니다.
    """
    source = bundled_resource_path("test_extension")
    if not source.is_dir():
        raise FileNotFoundError(f"테스트 익스텐션 리소스를 찾지 못했습니다: {source}")

    target = app_data_dir() / "extensions" / "auto_install_test_extension"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target, dirs_exist_ok=True)

    valid, _name, error = validate_extension_directory(target)
    if not valid:
        raise ValueError(error)
    return target


def load_config() -> dict[str, Any]:
    try:
        with config_path().open("r", encoding="utf-8-sig") as file:
            data = json.load(file)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_config(data: dict[str, Any]) -> None:
    with config_path().open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError("JSON 최상위 값이 객체가 아닙니다.")
    return data


def nested_get(data: dict[str, Any], keys: Iterable[str], default: Any = None) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def profile_sort_key(name: str) -> tuple[int, int, str]:
    if name == "Default":
        return 0, 0, name
    if name.startswith("Profile "):
        try:
            return 1, int(name.split(" ", 1)[1]), name
        except ValueError:
            pass
    return 2, 0, name.lower()


def normalize_profile_path(path: Path) -> tuple[Path, Path | None]:
    path = path.expanduser()
    if path.is_file() and path.name == "Preferences":
        path = path.parent
    if (path / "Preferences").is_file():
        return path.parent, path
    if (path / "User Data").is_dir():
        return path / "User Data", None
    return path, None


def discover_profiles(
    browser: BrowserSpec,
    original_path: Path,
    source: str,
) -> list[Profile]:
    user_data, exact_profile = normalize_profile_path(original_path)
    if not user_data.is_dir():
        return []

    info_cache: dict[str, Any] = {}
    last_used = ""
    local_state = user_data / "Local State"

    if local_state.is_file():
        try:
            state = load_json(local_state)
            cache = nested_get(state, ("profile", "info_cache"), {})
            if isinstance(cache, dict):
                info_cache = cache
            value = nested_get(state, ("profile", "last_used"), "")
            if isinstance(value, str):
                last_used = value
        except Exception:
            pass

    profile_dirs: dict[str, Path] = {}
    if exact_profile is not None:
        profile_dirs[exact_profile.name] = exact_profile
    else:
        for directory_name in info_cache:
            candidate = user_data / directory_name
            if (candidate / "Preferences").is_file():
                profile_dirs[directory_name] = candidate

        try:
            for preference in user_data.glob("*/Preferences"):
                if preference.is_file():
                    profile_dirs[preference.parent.name] = preference.parent
        except OSError:
            pass

    result: list[Profile] = []
    for directory_name, directory in sorted(
        profile_dirs.items(), key=lambda item: profile_sort_key(item[0])
    ):
        cache_entry = info_cache.get(directory_name, {})
        display_name = directory_name
        if isinstance(cache_entry, dict):
            display_name = (
                cache_entry.get("name")
                or cache_entry.get("shortcut_name")
                or cache_entry.get("gaia_name")
                or directory_name
            )

        result.append(
            Profile(
                browser=browser,
                user_data_dir=user_data,
                directory_name=directory_name,
                display_name=str(display_name),
                preferences_path=directory / "Preferences",
                is_last_used=(directory_name == last_used),
                source=source,
            )
        )
    return result


def find_browser_executable(browser: BrowserSpec) -> Path | None:
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    program_files = Path(os.environ.get("PROGRAMFILES", ""))
    program_files_x86 = Path(os.environ.get("PROGRAMFILES(X86)", ""))

    candidates: list[Path] = []
    if browser.key == "chrome":
        candidates.extend(
            (
                program_files / "Google/Chrome/Application/chrome.exe",
                program_files_x86 / "Google/Chrome/Application/chrome.exe",
                local / "Google/Chrome/Application/chrome.exe",
            )
        )
    elif browser.key == "edge":
        candidates.extend(
            (
                program_files_x86 / "Microsoft/Edge/Application/msedge.exe",
                program_files / "Microsoft/Edge/Application/msedge.exe",
                local / "Microsoft/Edge/Application/msedge.exe",
            )
        )
    elif browser.key == "whale":
        candidates.extend(
            (
                program_files / "Naver/Naver Whale/Application/whale.exe",
                program_files_x86 / "Naver/Naver Whale/Application/whale.exe",
                local / "Naver/Naver Whale/Application/whale.exe",
            )
        )

    for name in browser.process_names:
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    for candidate in unique_paths(candidates):
        if candidate.is_file():
            return candidate
    return None


def process_is_running(browser: BrowserSpec) -> bool:
    names = {name.lower() for name in browser.process_names}

    if psutil is not None:
        for process in psutil.process_iter(["name"]):
            try:
                if (process.info.get("name") or "").lower() in names:
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return False

    try:
        completed = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            timeout=8,
        )
        rows = csv.reader(completed.stdout.splitlines())
        running = {row[0].strip().lower() for row in rows if row}
        return bool(names & running)
    except Exception:
        return False


def terminate_browser(browser: BrowserSpec) -> tuple[bool, str]:
    details: list[str] = []
    names = {name.lower() for name in browser.process_names}

    if psutil is not None:
        targets = []
        for process in psutil.process_iter(["name"]):
            try:
                if (process.info.get("name") or "").lower() in names:
                    targets.append(process)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        for process in targets:
            try:
                process.terminate()
            except Exception as exc:
                details.append(str(exc))

        _gone, alive = psutil.wait_procs(targets, timeout=4)
        for process in alive:
            try:
                process.kill()
            except Exception as exc:
                details.append(str(exc))
        psutil.wait_procs(alive, timeout=4)

    if process_is_running(browser):
        for name in browser.process_names:
            try:
                completed = subprocess.run(
                    ["taskkill", "/F", "/IM", name, "/T"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="ignore",
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    timeout=12,
                )
                output = (completed.stdout or completed.stderr).strip()
                if output:
                    details.append(output)
            except Exception as exc:
                details.append(str(exc))

    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if not process_is_running(browser):
            time.sleep(1.2)
            return True, "\n".join(details)
        time.sleep(0.4)

    return False, "\n".join(details) or "브라우저 프로세스가 계속 실행 중입니다."


def launch_profile(profile: Profile) -> tuple[bool, str]:
    executable = find_browser_executable(profile.browser)
    if executable is None:
        return False, "브라우저 실행 파일을 찾지 못했습니다."

    command = [
        str(executable),
        f"--user-data-dir={profile.user_data_dir}",
        f"--profile-directory={profile.directory_name}",
        "--force-renderer-accessibility",
        "--start-maximized",
        "--new-window",
        "about:blank",
    ]
    try:
        subprocess.Popen(command)
        return True, ""
    except Exception as exc:
        return False, str(exc)


def browser_process_stems(browser: BrowserSpec) -> set[str]:
    return {Path(name).stem.lower() for name in browser.process_names}


def window_belongs_to_browser(window: Any, browser: BrowserSpec) -> bool:
    if psutil is None:
        return True
    try:
        process_id = window.process_id()
        name = psutil.Process(process_id).name()
        return Path(name).stem.lower() in browser_process_stems(browser)
    except Exception:
        return False


def find_browser_window(
    browser: BrowserSpec,
    timeout_seconds: float = 20,
) -> tuple[Any | None, str]:
    if Desktop is None:
        return None, "UI 자동화 모듈을 사용할 수 없습니다."

    deadline = time.monotonic() + timeout_seconds
    last_error = ""
    while time.monotonic() < deadline:
        try:
            windows = []
            for window in Desktop(backend="uia").windows():
                try:
                    if not window_belongs_to_browser(window, browser):
                        continue
                    if not window.is_visible():
                        continue
                    if "Chrome_WidgetWin" not in (window.class_name() or ""):
                        continue
                    windows.append(window)
                except Exception as exc:
                    last_error = str(exc)

            if windows:
                return windows[-1], ""
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.4)

    return None, last_error or "브라우저 창을 찾지 못했습니다."


def normalized_text(value: str) -> str:
    return " ".join(value.lower().replace("_", " ").split())


def find_address_bar(window: Any) -> Any | None:
    try:
        controls = window.descendants(control_type="Edit")
    except Exception:
        return None

    for control in controls:
        try:
            info = control.element_info
            automation_id = (info.automation_id or "").lower()
            name = normalized_text(info.name or control.window_text() or "")
            if automation_id in {"view_1012", "view_1021"}:
                return control
            if (
                ("주소" in name and ("검색" in name or "표시줄" in name or "창" in name))
                or "address bar" in name
                or "address and search" in name
            ):
                return control
        except Exception:
            continue
    return None


def navigate_to_extensions(profile: Profile) -> tuple[bool, Any | None, str]:
    window, error = find_browser_window(profile.browser)
    if window is None:
        return False, None, error

    url = f"{profile.browser.scheme}://extensions"
    try:
        # 명령줄의 --start-maximized가 무시되는 브라우저 버전을 대비해
        # Windows UI Automation으로 창을 한 번 더 최대화합니다.
        try:
            window.restore()
        except Exception:
            pass
        try:
            window.maximize()
        except Exception:
            pass
        window.set_focus()
        time.sleep(0.5)
    except Exception:
        pass

    address_bar = find_address_bar(window)
    if address_bar is not None:
        try:
            address_bar.set_focus()
            address_bar.set_edit_text(url)
            address_bar.type_keys("{ENTER}")
            time.sleep(2.0)
            return True, window, ""
        except Exception:
            pass

    try:
        if send_keys is None:
            raise RuntimeError("키보드 자동화 모듈을 사용할 수 없습니다.")
        window.set_focus()
        send_keys("^l")
        time.sleep(0.2)
        send_keys(url, with_spaces=True, pause=0.03)
        send_keys("{ENTER}")
        time.sleep(2.0)
        return True, window, ""
    except Exception as exc:
        return False, window, str(exc)


def is_developer_mode_label(name: str) -> bool:
    value = normalized_text(name)
    return (
        value == "개발자 모드"
        or value == "developer mode"
        or ("개발자" in value and "모드" in value)
        or ("developer" in value and "mode" in value)
    )


def find_developer_toggle(
    browser: BrowserSpec,
    timeout_seconds: float = 20,
) -> tuple[Any | None, Any | None, str]:
    if Desktop is None:
        return None, None, "UI 자동화 모듈을 사용할 수 없습니다."

    deadline = time.monotonic() + timeout_seconds
    last_error = ""

    while time.monotonic() < deadline:
        try:
            windows = [
                window
                for window in Desktop(backend="uia").windows()
                if window_belongs_to_browser(window, browser)
            ]
            for window in reversed(windows):
                try:
                    id_matches: list[Any] = []
                    name_matches: list[Any] = []

                    for control in window.descendants():
                        try:
                            info = control.element_info
                            control_type = (info.control_type or "").lower()
                            if control_type not in {"button", "checkbox", "switch"}:
                                continue

                            automation_id = (
                                (info.automation_id or "")
                                .replace("_", "")
                                .replace("-", "")
                                .replace(" ", "")
                                .lower()
                            )
                            name = info.name or control.window_text() or ""

                            if automation_id == "devmode":
                                id_matches.append(control)
                            elif is_developer_mode_label(name):
                                name_matches.append(control)
                        except Exception as exc:
                            last_error = str(exc)

                    candidates = id_matches or name_matches
                    if candidates:
                        candidates.sort(key=lambda item: 0 if item.is_visible() else 1)
                        return window, candidates[0], ""
                except Exception as exc:
                    last_error = str(exc)
        except Exception as exc:
            last_error = str(exc)

        time.sleep(0.5)

    return None, None, last_error or "개발자 모드 버튼을 찾지 못했습니다."


def find_root_document(window: Any) -> Any | None:
    try:
        documents = window.descendants(control_type="Document")
        for document in documents:
            if (document.element_info.automation_id or "") == "RootWebArea":
                return document
        return documents[0] if documents else None
    except Exception:
        return None


def ensure_developer_section_visible(
    profile: Profile,
    window: Any,
    toggle: Any,
) -> tuple[Any, Any, bool, str]:
    try:
        if toggle.is_visible():
            return window, toggle, True, "현재 화면"
    except Exception:
        pass

    try:
        toggle.iface_scroll_item.ScrollIntoView()
        time.sleep(0.8)
        refreshed_window, refreshed_toggle, _error = find_developer_toggle(
            profile.browser, 3
        )
        window = refreshed_window or window
        toggle = refreshed_toggle or toggle
        if toggle.is_visible():
            return window, toggle, True, "자동 스크롤"
    except Exception:
        pass

    sequences = (
        ("^{END}", "^{HOME}", "^{END}")
        if profile.browser.key == "whale"
        else ("^{HOME}", "^{END}", "^{HOME}")
    )

    document = find_root_document(window)
    try:
        (document or window).set_focus()
    except Exception:
        pass

    for sequence in sequences:
        try:
            if send_keys is None:
                break
            send_keys(sequence)
            time.sleep(1.0)
            refreshed_window, refreshed_toggle, _error = find_developer_toggle(
                profile.browser, 3
            )
            window = refreshed_window or window
            toggle = refreshed_toggle or toggle
            if toggle.is_visible():
                return window, toggle, True, sequence
        except Exception:
            pass

    return window, toggle, False, "화면 이동 실패"


DEV_TOOL_IDS = {"loadunpacked", "packextensions", "updatenow"}


def visible_developer_controls(window: Any) -> list[str]:
    result: list[str] = []
    try:
        controls = window.descendants()
    except Exception:
        return result

    for control in controls:
        try:
            automation_id = (
                (control.element_info.automation_id or "")
                .replace("_", "")
                .replace("-", "")
                .lower()
            )
            if automation_id in DEV_TOOL_IDS and control.is_visible():
                result.append(control.element_info.automation_id)
        except Exception:
            pass
    return result


def read_developer_state(window: Any, toggle: Any) -> tuple[bool | None, str]:
    try:
        state = int(toggle.get_toggle_state())
        if state in (0, 1):
            return state == 1, "UIA 토글 상태"
    except Exception:
        pass

    try:
        state = int(toggle.iface_toggle.CurrentToggleState)
        if state in (0, 1):
            return state == 1, "UIA TogglePattern"
    except Exception:
        pass

    try:
        legacy = toggle.legacy_properties()
        legacy_state = legacy.get("State")
        if isinstance(legacy_state, int) and legacy_state & 0x10:
            return True, "접근성 체크 상태"
    except Exception:
        pass

    tools = visible_developer_controls(window)
    if tools:
        return True, "개발자 도구 표시"

    try:
        if toggle.is_visible():
            return False, "개발자 도구 숨김"
    except Exception:
        pass

    return None, "판별 불가"


def is_load_unpacked_label(name: str) -> bool:
    value = normalized_text(name)
    return (
        "load unpacked" in value
        or ("압축" in value and ("로드" in value or "불러" in value))
        or ("unpacked" in value and ("load" in value or "open" in value))
    )


def find_load_unpacked_button(
    browser: BrowserSpec,
    timeout_seconds: float = 15,
) -> tuple[Any | None, Any | None, str]:
    if Desktop is None:
        return None, None, "UI 자동화 모듈을 사용할 수 없습니다."

    deadline = time.monotonic() + timeout_seconds
    last_error = ""
    while time.monotonic() < deadline:
        try:
            windows = [
                window
                for window in Desktop(backend="uia").windows()
                if window_belongs_to_browser(window, browser)
            ]
            for window in reversed(windows):
                id_matches: list[Any] = []
                name_matches: list[Any] = []
                for control in window.descendants():
                    try:
                        info = control.element_info
                        if (info.control_type or "").lower() != "button":
                            continue
                        automation_id = (
                            (info.automation_id or "")
                            .replace("_", "")
                            .replace("-", "")
                            .replace(" ", "")
                            .lower()
                        )
                        name = info.name or control.window_text() or ""
                        if automation_id == "loadunpacked":
                            id_matches.append(control)
                        elif is_load_unpacked_label(name):
                            name_matches.append(control)
                    except Exception as exc:
                        last_error = str(exc)

                candidates = id_matches or name_matches
                if candidates:
                    candidates.sort(key=lambda item: 0 if item.is_visible() else 1)
                    return window, candidates[0], ""
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.4)

    return None, None, last_error or "'압축해제된 확장 프로그램 로드' 버튼을 찾지 못했습니다."


def top_level_window_handles() -> set[int]:
    if Desktop is None:
        return set()
    result: set[int] = set()
    try:
        for window in Desktop(backend="uia").windows():
            try:
                result.add(int(window.handle))
            except Exception:
                pass
    except Exception:
        pass
    return result


def control_automation_id(control: Any) -> str:
    try:
        return str(control.element_info.automation_id or "")
    except Exception:
        return ""


def folder_dialog_controls(dialog: Any) -> tuple[Any | None, Any | None]:
    """Windows 폴더 선택창의 '폴더:' 입력칸과 '폴더 선택' 버튼을 찾습니다."""
    folder_edit = None
    select_button = None
    try:
        descendants = dialog.descendants()
    except Exception:
        descendants = []

    for control in descendants:
        try:
            info = control.element_info
            automation_id = str(info.automation_id or "")
            control_type = str(info.control_type or "").lower()
            name = info.name or control.window_text() or ""

            if (
                folder_edit is None
                and control_type == "edit"
                and automation_id == "1152"
            ):
                folder_edit = control

            if control_type == "button":
                if automation_id == "1" and is_select_folder_label(name):
                    select_button = control
                elif select_button is None and is_select_folder_label(name):
                    select_button = control
        except Exception:
            continue

    return folder_edit, select_button


def folder_dialog_is_open(dialog: Any) -> bool:
    try:
        folder_edit, select_button = folder_dialog_controls(dialog)
        return bool(
            folder_edit is not None
            and select_button is not None
            and folder_edit.is_visible()
            and select_button.is_visible()
        )
    except Exception:
        return False


def find_extension_folder_dialog(
    browser: BrowserSpec,
    previous_handles: set[int],
    timeout_seconds: float = 12,
) -> tuple[Any | None, str]:
    if Desktop is None:
        return None, "UI 자동화 모듈을 사용할 수 없습니다."

    deadline = time.monotonic() + timeout_seconds
    last_error = ""
    title_words = (
        "select the extension directory",
        "select folder",
        "choose folder",
        "폴더 선택",
        "디렉터리 선택",
        "확장 디렉토리",
        "확장 프로그램 디렉터리",
        "확장앱 디렉터리",
    )

    while time.monotonic() < deadline:
        try:
            candidates: list[tuple[tuple[int, int, int, int], Any]] = []
            for top_window in Desktop(backend="uia").windows():
                try:
                    if not top_window.is_visible():
                        continue

                    top_handle = int(top_window.handle)
                    is_new_top = top_handle not in previous_handles
                    top_class = top_window.class_name() or ""
                    browser_owner = window_belongs_to_browser(
                        top_window,
                        browser,
                    )

                    # Edge/Chrome의 폴더 선택창은 별도 최상위 창일 수도 있고,
                    # 브라우저 창 아래의 자식 Window로 노출될 수도 있습니다.
                    try:
                        nested_windows = top_window.descendants(
                            control_type="Window"
                        )
                    except Exception:
                        nested_windows = []

                    scan_targets = list(nested_windows) + [top_window]
                    for candidate in scan_targets:
                        try:
                            if not candidate.is_visible():
                                continue
                            title = normalized_text(
                                candidate.element_info.name
                                or candidate.window_text()
                                or ""
                            )
                            title_match = any(
                                word in title for word in title_words
                            )
                            folder_edit, select_button = (
                                folder_dialog_controls(candidate)
                            )
                            controls_match = (
                                folder_edit is not None
                                and select_button is not None
                            )
                            is_nested = candidate is not top_window
                            dialog_class = top_class in {
                                "#32770",
                                "CabinetWClass",
                            }

                            if not (
                                title_match
                                or controls_match
                                or (
                                    is_new_top
                                    and (dialog_class or browser_owner)
                                )
                            ):
                                continue

                            # 실제 자식 대화상자 + 정확한 1152/1 컨트롤을 최우선합니다.
                            score = (
                                0 if controls_match else 1,
                                0 if title_match else 1,
                                0 if is_nested else 1,
                                0 if is_new_top else 1,
                            )
                            candidates.append((score, candidate))
                        except Exception as exc:
                            last_error = str(exc)
                except Exception as exc:
                    last_error = str(exc)

            if candidates:
                candidates.sort(key=lambda item: item[0])
                return candidates[0][1], ""
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.35)

    return None, last_error or "익스텐션 폴더 선택 창을 찾지 못했습니다."


def escape_send_keys_text(value: str) -> str:
    """pywinauto send_keys에서 특별한 의미를 갖는 문자를 이스케이프합니다."""
    escaped: list[str] = []
    special = {"+", "^", "%", "~", "(", ")", "{", "}"}
    for character in value:
        if character in special:
            escaped.append("{" + character + "}")
        else:
            escaped.append(character)
    return "".join(escaped)


def is_select_folder_label(name: str) -> bool:
    value = normalized_text(name).replace("&", "")
    return (
        value in {
            "select folder",
            "choose folder",
            "select",
            "폴더 선택",
            "선택",
            "확인",
        }
        or "select folder" in value
        or "choose folder" in value
        or "폴더 선택" in value
    )


def read_edit_value(edit: Any) -> str:
    for reader in (
        lambda: edit.get_value(),
        lambda: edit.iface_value.CurrentValue,
        lambda: edit.window_text(),
    ):
        try:
            value = reader()
            if value is not None:
                return str(value)
        except Exception:
            continue
    return ""


def choose_extension_folder(dialog: Any, extension_path: Path) -> tuple[bool, str]:
    target_path = str(extension_path.resolve())
    try:
        dialog.set_focus()
    except Exception:
        pass

    folder_edit, select_button = folder_dialog_controls(dialog)
    direct_errors: list[str] = []
    direct_input_done = False

    # 진단 로그에서 확인된 Windows 폴더 선택창의 정확한 입력칸:
    # Edit automation_id='1152', name='폴더:'
    if folder_edit is not None:
        try:
            folder_edit.set_focus()
        except Exception as exc:
            direct_errors.append(f"입력칸 포커스: {exc}")

        try:
            folder_edit.set_edit_text(target_path)
            time.sleep(0.35)
            direct_input_done = True
        except Exception as exc:
            direct_errors.append(f"set_edit_text: {exc}")
            try:
                folder_edit.click_input()
                send_keys("^a")
                send_keys(
                    escape_send_keys_text(target_path),
                    with_spaces=True,
                    pause=0.01,
                )
                time.sleep(0.35)
                direct_input_done = True
            except Exception as fallback_exc:
                direct_errors.append(f"직접 입력: {fallback_exc}")

    # 1152 입력칸을 찾지 못한 Windows 버전에서만 주소 표시줄 방식을 사용합니다.
    if not direct_input_done:
        if send_keys is None:
            direct_errors.append("키보드 자동화 모듈을 사용할 수 없습니다.")
        else:
            try:
                dialog.set_focus()
                send_keys("^l")
                time.sleep(0.25)
                send_keys(
                    escape_send_keys_text(target_path),
                    with_spaces=True,
                    pause=0.01,
                )
                send_keys("{ENTER}")
                time.sleep(0.8)
                direct_input_done = True
                folder_edit, select_button = folder_dialog_controls(dialog)
            except Exception as exc:
                direct_errors.append(f"주소 표시줄 입력: {exc}")

    if not direct_input_done:
        return (
            False,
            "테스트 익스텐션 경로를 폴더 선택창에 입력하지 못했습니다.\n"
            f"대상 경로: {target_path}\n"
            + "\n".join(direct_errors),
        )

    entered_value = read_edit_value(folder_edit) if folder_edit is not None else ""

    # automation_id='1'인 '폴더 선택' 버튼을 이름 검색보다 우선합니다.
    if select_button is None:
        _folder_edit, select_button = folder_dialog_controls(dialog)

    if select_button is None:
        return (
            False,
            "폴더 선택 버튼(automation_id=1)을 찾지 못했습니다.\n"
            f"대상 경로: {target_path}\n"
            f"입력값: {entered_value}",
        )

    click_errors: list[str] = []
    for attempt in range(1, 3):
        clicked = False
        for method_name, action in (
            ("마우스 클릭", lambda: select_button.click_input()),
            ("UIA Invoke", lambda: select_button.invoke()),
            ("버튼 클릭", lambda: select_button.click()),
        ):
            try:
                action()
                clicked = True
                break
            except Exception as exc:
                click_errors.append(
                    f"{attempt}차 {method_name}: {exc}"
                )

        if not clicked:
            continue

        deadline = time.monotonic() + 2.5
        while time.monotonic() < deadline:
            if not folder_dialog_is_open(dialog):
                return (
                    True,
                    "테스트 익스텐션 경로 직접 입력 및 폴더 선택 완료\n"
                    f"대상 경로: {target_path}",
                )
            time.sleep(0.2)

        # 첫 클릭이 해당 폴더로 이동만 시킨 경우 버튼을 다시 찾고 한 번 더 누릅니다.
        folder_edit, refreshed_button = folder_dialog_controls(dialog)
        if refreshed_button is not None:
            select_button = refreshed_button

    return (
        False,
        "폴더 선택창이 닫히지 않았습니다.\n"
        f"대상 경로: {target_path}\n"
        f"입력값: {entered_value}\n"
        + "\n".join(click_errors),
    )



def extension_page_message(
    browser: BrowserSpec,
    extension_name: str,
) -> tuple[bool, str]:
    """관리 페이지에서 확장 프로그램 이름 또는 로드 오류를 찾습니다."""
    wanted = normalized_text(extension_name)
    errors = (
        "failed to load extension",
        "could not load manifest",
        "manifest file is missing",
        "확장 프로그램을 로드하지 못",
        "확장을 로드하지 못",
        "확장을 로드할 수 없",
        "매니페스트 파일이 없",
        "manifest.json을",
    )

    try:
        windows = [
            window
            for window in Desktop(backend="uia").windows()
            if window_belongs_to_browser(window, browser)
        ]
        for window in reversed(windows):
            for control in window.descendants():
                try:
                    value = normalized_text(
                        control.element_info.name or control.window_text() or ""
                    )
                    if wanted and wanted in value:
                        return True, f"관리 페이지에서 '{extension_name}' 확인"
                    if any(error in value for error in errors):
                        return False, value
                except Exception:
                    pass
    except Exception:
        pass
    return False, ""


def install_unpacked_extension(
    profile: Profile,
    extension_path: Path,
) -> tuple[bool, str]:
    valid, extension_name, description = validate_extension_directory(extension_path)
    if not valid:
        return False, description

    window, button, error = find_load_unpacked_button(profile.browser)
    if window is None or button is None:
        return False, error

    try:
        if not button.is_visible():
            try:
                button.iface_scroll_item.ScrollIntoView()
                time.sleep(0.5)
            except Exception:
                pass
        window.set_focus()
    except Exception:
        pass

    previous_handles = top_level_window_handles()
    click_errors: list[str] = []
    clicked = False
    for method_name, action in (
        ("UIA Invoke", lambda: button.invoke()),
        ("버튼 클릭", lambda: button.click()),
        ("마우스 클릭", lambda: button.click_input()),
    ):
        try:
            action()
            clicked = True
            break
        except Exception as exc:
            click_errors.append(f"{method_name}: {exc}")

    if not clicked:
        return False, "로드 버튼 클릭 실패\n" + "\n".join(click_errors)

    dialog, error = find_extension_folder_dialog(
        profile.browser,
        previous_handles,
    )
    if dialog is None:
        return False, error

    chosen, detail = choose_extension_folder(dialog, extension_path.resolve())
    if not chosen:
        return False, detail

    dialog_deadline = time.monotonic() + 5
    while time.monotonic() < dialog_deadline:
        if not folder_dialog_is_open(dialog):
            break
        time.sleep(0.25)
    else:
        return (
            False,
            "폴더 선택 창이 닫히지 않았습니다.\n"
            f"자동 입력 대상: {extension_path.resolve()}",
        )

    deadline = time.monotonic() + 12
    last_error = ""
    while time.monotonic() < deadline:
        found, message = extension_page_message(profile.browser, extension_name)
        if found:
            return True, f"{description} 자동 설치 완료"
        if message:
            last_error = message
            break
        time.sleep(0.5)

    if last_error:
        return False, f"{description} 로드 실패\n{last_error}"

    # 접근성 트리에서 카드 이름을 읽지 못하더라도 폴더 선택 창이 정상 완료된 경우
    # 설치 요청 자체는 성공으로 처리하고 사용자가 관리 페이지에서 확인할 수 있게 합니다.
    return True, f"{description} 폴더 선택 완료 · 관리 페이지에서 최종 상태를 확인하세요."


def dump_accessibility_tree(browser: BrowserSpec) -> Path:
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = diagnostic_dir() / f"uia_{browser.key}_{stamp}.txt"
    lines = [
        f"{APP_NAME} {APP_VERSION}",
        f"Browser: {browser.display_name}",
        f"Time: {dt.datetime.now().isoformat()}",
        "",
    ]

    try:
        for window in Desktop(backend="uia").windows():
            if not window_belongs_to_browser(window, browser):
                continue
            lines.append(
                f"WINDOW title={window.window_text()!r} "
                f"class={window.class_name()!r} pid={window.process_id()}"
            )
            for control in window.descendants():
                try:
                    info = control.element_info
                    lines.append(
                        f"  type={info.control_type!r} name={info.name!r} "
                        f"automation_id={info.automation_id!r} "
                        f"enabled={control.is_enabled()} visible={control.is_visible()}"
                    )
                except Exception:
                    pass
    except Exception as exc:
        lines.append(f"ERROR: {exc}")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def perform_browser_operation(
    profile: Profile,
    target_state: bool | None,
    extension_path: Path | None = None,
) -> tuple[bool, bool | None, str]:
    if extension_path is not None:
        valid, _name, error = validate_extension_directory(extension_path)
        if not valid:
            return False, None, error
        target_state = True

    stopped, detail = terminate_browser(profile.browser)
    if not stopped:
        return False, None, f"브라우저 종료 실패\n{detail}"

    launched, error = launch_profile(profile)
    if not launched:
        return False, None, error

    navigated, _window, error = navigate_to_extensions(profile)
    if not navigated:
        diagnostic = dump_accessibility_tree(profile.browser)
        return False, None, f"확장 프로그램 페이지 이동 실패\n{error}\n{diagnostic}"

    window, toggle, error = find_developer_toggle(profile.browser)
    if toggle is None or window is None:
        diagnostic = dump_accessibility_tree(profile.browser)
        return False, None, f"{error}\n진단 파일: {diagnostic}"

    window, toggle, visible, scroll_method = ensure_developer_section_visible(
        profile, window, toggle
    )
    current, detection = read_developer_state(window, toggle)

    if current is None:
        diagnostic = dump_accessibility_tree(profile.browser)
        return (
            False,
            None,
            f"실제 상태를 확인하지 못했습니다.\n"
            f"화면 이동: {scroll_method}\n판별: {detection}\n"
            f"진단 파일: {diagnostic}",
        )

    if target_state is None:
        return True, current, f"실제 상태 확인 완료 · {detection}"

    state_detail = "이미 요청한 상태입니다."
    if current != target_state:
        if not toggle.is_enabled():
            diagnostic = dump_accessibility_tree(profile.browser)
            return False, current, f"정책으로 버튼이 비활성화됐습니다.\n{diagnostic}"

        attempts: list[str] = []

        def reacquire() -> tuple[bool | None, str]:
            nonlocal window, toggle
            new_window, new_toggle, _error = find_developer_toggle(
                profile.browser, 3
            )
            window = new_window or window
            toggle = new_toggle or toggle
            window, toggle, _visible, _scroll = ensure_developer_section_visible(
                profile, window, toggle
            )
            return read_developer_state(window, toggle)

        def wait_target(seconds: float = 3.0) -> tuple[bool | None, str]:
            deadline = time.monotonic() + seconds
            state: bool | None = None
            method = ""
            while time.monotonic() < deadline:
                time.sleep(0.4)
                state, method = reacquire()
                if state == target_state:
                    return state, method
            return state, method

        def invoke() -> None:
            toggle.invoke()

        def wrapper_click() -> None:
            toggle.click()

        def physical_click() -> None:
            nonlocal window, toggle
            window, toggle, is_visible, _method = ensure_developer_section_visible(
                profile, window, toggle
            )
            if not is_visible:
                raise RuntimeError("버튼이 화면에 표시되지 않았습니다.")
            toggle.click_input()

        def press_space() -> None:
            nonlocal window, toggle
            if send_keys is None:
                raise RuntimeError("키보드 자동화를 사용할 수 없습니다.")
            window, toggle, is_visible, _method = ensure_developer_section_visible(
                profile, window, toggle
            )
            if not is_visible:
                raise RuntimeError("버튼이 화면에 표시되지 않았습니다.")
            toggle.set_focus()
            time.sleep(0.2)
            send_keys("{SPACE}")

        methods = (
            ("UIA Invoke", invoke),
            ("버튼 클릭", wrapper_click),
            ("마우스 클릭", physical_click),
            ("Space 키", press_space),
        )

        final_state = current
        changed = False
        for method_name, action in methods:
            try:
                action()
                attempts.append(f"{method_name}: 실행")
            except Exception as exc:
                attempts.append(f"{method_name}: {exc}")
                continue

            final_state, method = wait_target()
            attempts.append(f"{method_name}: 상태={final_state}, 판별={method}")
            if final_state == target_state:
                current = final_state
                state_detail = f"개발자 모드 적용 완료 · {method_name}"
                changed = True
                break

        if not changed:
            diagnostic = dump_accessibility_tree(profile.browser)
            return (
                False,
                final_state,
                "요청한 상태로 변경되지 않았습니다.\n"
                + "\n".join(attempts)
                + f"\n진단 파일: {diagnostic}",
            )

    if extension_path is not None:
        installed, install_detail = install_unpacked_extension(
            profile,
            extension_path,
        )
        if not installed:
            diagnostic = dump_accessibility_tree(profile.browser)
            return (
                False,
                True,
                f"{install_detail}\n진단 파일: {diagnostic}",
            )
        return True, True, f"{state_detail}\n{install_detail}"

    return True, current, state_detail


class RoundedButton(tk.Canvas):
    """Tkinter 기본 기능만 사용하는 둥근 사각형 버튼."""

    def __init__(
        self,
        parent: tk.Misc,
        text: str,
        command: Any,
        *,
        width: int = 120,
        height: int = 38,
        radius: int = 12,
        background: str = "#4F46E5",
        foreground: str = "#FFFFFF",
        hover_background: str | None = None,
        border_color: str | None = None,
        font: tuple[Any, ...] | None = None,
    ) -> None:
        parent_bg = parent.cget("bg") if "bg" in parent.keys() else "#FFFFFF"
        super().__init__(
            parent,
            width=width,
            height=height,
            bg=parent_bg,
            highlightthickness=0,
            borderwidth=0,
            cursor="hand2",
        )
        self.button_text = text
        self.command = command
        self.button_width = width
        self.button_height = height
        self.radius = radius
        self.normal_background = background
        self.hover_background = hover_background or background
        self.foreground = foreground
        self.border_color = border_color or background
        self.button_font = font
        self.enabled = True

        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
        self.draw(self.normal_background)

    def _rounded_rectangle(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        radius: int,
        **kwargs: Any,
    ) -> int:
        points = [
            x1 + radius, y1,
            x2 - radius, y1,
            x2, y1,
            x2, y1 + radius,
            x2, y2 - radius,
            x2, y2,
            x2 - radius, y2,
            x1 + radius, y2,
            x1, y2,
            x1, y2 - radius,
            x1, y1 + radius,
            x1, y1,
        ]
        return self.create_polygon(
            points,
            smooth=True,
            splinesteps=24,
            **kwargs,
        )

    def draw(self, color: str) -> None:
        self.delete("all")
        self._rounded_rectangle(
            1,
            1,
            self.button_width - 1,
            self.button_height - 1,
            self.radius,
            fill=color,
            outline=self.border_color,
            width=1,
        )
        self.create_text(
            self.button_width // 2,
            self.button_height // 2,
            text=self.button_text,
            fill=self.foreground,
            font=self.button_font,
        )

    def set_colors(
        self,
        *,
        background: str,
        foreground: str,
        hover_background: str,
        border_color: str | None = None,
    ) -> None:
        self.normal_background = background
        self.hover_background = hover_background
        self.foreground = foreground
        self.border_color = border_color or background
        self.draw(self.normal_background)

    def set_text(self, text: str) -> None:
        self.button_text = text
        self.draw(self.normal_background)

    def _on_click(self, _event: Any) -> None:
        if self.enabled and self.command:
            self.command()

    def _on_enter(self, _event: Any) -> None:
        if self.enabled:
            self.draw(self.hover_background)

    def _on_leave(self, _event: Any) -> None:
        self.draw(self.normal_background)


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()

        self.title(APP_NAME)
        # v14 대비 가로 20% 축소, 세로 20% 확대
        self.geometry("940x900")
        self.minsize(880, 780)
        self.maxsize(1100, 1000)
        self.configure(bg="#F2F4F7")

        self.setup_windows_fonts()

        self.specs = browser_specs()
        self.config_data = load_config()
        self.profiles: dict[str, Profile] = {}
        self.checked_profiles: set[str] = set()
        self.profile_rows: dict[str, dict[str, Any]] = {}
        self.profile_check_vars: dict[str, tk.BooleanVar] = {}
        self.browser_buttons: dict[str, RoundedButton] = {}

        self.browser_filter = tk.StringVar(value="전체")
        self.target_state = True
        self.status_text = tk.StringVar(value="브라우저 프로필을 불러오는 중입니다.")
        self.selection_text = tk.StringVar(value="선택된 프로필이 없습니다.")

        self.test_extension_path: Path | None = None
        try:
            self.test_extension_path = prepare_bundled_test_extension()
        except Exception as exc:
            self.status_text.set(f"테스트 익스텐션 준비 실패: {exc}")

        saved_extension_path = self.config_data.get("extension_path", "")
        if not isinstance(saved_extension_path, str):
            saved_extension_path = ""
        if not saved_extension_path and self.test_extension_path is not None:
            saved_extension_path = str(self.test_extension_path)
        self.extension_path_var = tk.StringVar(value=saved_extension_path)

        self.build_ui()
        self.after(150, self.refresh_profiles)

    def setup_windows_fonts(self) -> None:
        """Windows에서 가장 읽기 쉬운 기본 한글 글꼴을 사용합니다."""
        available = set(tkfont.families(self))
        if "맑은 고딕" in available:
            self.font_family = "맑은 고딕"
        elif "Malgun Gothic" in available:
            self.font_family = "Malgun Gothic"
        else:
            self.font_family = tkfont.nametofont("TkDefaultFont").cget("family")

        for font_name in (
            "TkDefaultFont",
            "TkTextFont",
            "TkMenuFont",
            "TkHeadingFont",
            "TkCaptionFont",
            "TkSmallCaptionFont",
            "TkIconFont",
            "TkTooltipFont",
        ):
            try:
                named_font = tkfont.nametofont(font_name)
                named_font.configure(family=self.font_family, size=11)
            except tk.TclError:
                pass

        self.default_font = (self.font_family, 11)
        self.bold_font = (self.font_family, 11, "bold")
        self.small_font = (self.font_family, 10)
        self.title_font = (self.font_family, 21, "bold")
        self.section_font = (self.font_family, 14, "bold")
        self.profile_font = (self.font_family, 12, "bold")

        self.option_add("*Font", self.default_font)

    def make_button(
        self,
        parent: tk.Misc,
        text: str,
        command: Any,
        *,
        kind: str = "normal",
        padx: int = 16,
        pady: int = 9,
        font: tuple[Any, ...] | None = None,
    ) -> tk.Button:
        colors = {
            "normal": ("#FFFFFF", "#344054", "#EAECF0", "#F9FAFB"),
            "primary": ("#4F46E5", "#FFFFFF", "#4F46E5", "#4338CA"),
            "dark": ("#101828", "#FFFFFF", "#101828", "#1D2939"),
            "success": ("#ECFDF3", "#027A48", "#ABEFC6", "#D1FADF"),
            "danger": ("#FEF3F2", "#B42318", "#FECDCA", "#FEE4E2"),
        }
        bg, fg, border, active_bg = colors[kind]
        return tk.Button(
            parent,
            text=text,
            command=command,
            font=font or self.bold_font,
            bg=bg,
            fg=fg,
            activebackground=active_bg,
            activeforeground=fg,
            relief="flat",
            borderwidth=0,
            highlightthickness=1,
            highlightbackground=border,
            highlightcolor=border,
            padx=padx,
            pady=pady,
            cursor="hand2",
        )

    def build_ui(self) -> None:
        # 설명 문구 없이 제목만 표시합니다.
        header = tk.Frame(self, bg="#FFFFFF", height=78)
        header.pack(fill="x")
        header.pack_propagate(False)

        tk.Label(
            header,
            text=APP_NAME,
            font=self.title_font,
            bg="#FFFFFF",
            fg="#101828",
        ).pack(side="left", padx=22, pady=18)

        tk.Label(
            header,
            text=f"버전 {APP_VERSION}",
            font=self.bold_font,
            bg="#EEF2FF",
            fg="#4338CA",
            padx=13,
            pady=7,
        ).pack(side="right", padx=22)

        body = tk.Frame(self, bg="#F2F4F7")
        body.pack(fill="both", expand=True, padx=16, pady=(12, 10))

        # 브라우저 선택: 서로 다른 색상의 둥근 사각형 버튼
        filter_card = tk.Frame(
            body,
            bg="#FFFFFF",
            highlightbackground="#D0D5DD",
            highlightthickness=1,
        )
        filter_card.pack(fill="x", pady=(0, 12))

        tk.Label(
            filter_card,
            text="브라우저",
            font=self.bold_font,
            bg="#FFFFFF",
            fg="#344054",
        ).pack(side="left", padx=(14, 10), pady=13)

        browser_options = [
            ("전체", 74),
            ("Google Chrome", 126),
            ("Microsoft Edge", 132),
            ("NAVER Whale", 120),
        ]
        for name, width in browser_options:
            button = RoundedButton(
                filter_card,
                name,
                lambda value=name: self.set_browser_filter(value),
                width=width,
                height=38,
                radius=13,
                background="#F2F4F7",
                foreground="#344054",
                hover_background="#EAECF0",
                border_color="#D0D5DD",
                font=self.small_font,
            )
            button.pack(side="left", padx=(0, 7), pady=10)
            self.browser_buttons[name] = button

        self.update_browser_buttons()

        # 프로필 목록 카드
        profile_card = tk.Frame(
            body,
            bg="#FFFFFF",
            highlightbackground="#D0D5DD",
            highlightthickness=1,
        )
        profile_card.pack(fill="both", expand=True)

        card_header = tk.Frame(profile_card, bg="#FFFFFF")
        card_header.pack(fill="x", padx=14, pady=(12, 9))

        tk.Label(
            card_header,
            text="프로필 목록",
            font=self.section_font,
            bg="#FFFFFF",
            fg="#101828",
        ).pack(side="left")

        # 전체 선택과 전체 해제도 색상이 다른 둥근 사각형 버튼
        clear_button = RoundedButton(
            card_header,
            "전체 해제",
            self.clear_checks,
            width=98,
            height=36,
            radius=12,
            background="#FEF3F2",
            foreground="#B42318",
            hover_background="#FEE4E2",
            border_color="#FECDCA",
            font=self.small_font,
        )
        clear_button.pack(side="right")

        select_all_button = RoundedButton(
            card_header,
            "전체 선택",
            self.check_all_visible,
            width=98,
            height=36,
            radius=12,
            background="#EEF2FF",
            foreground="#4338CA",
            hover_background="#E0E7FF",
            border_color="#C7D2FE",
            font=self.small_font,
        )
        select_all_button.pack(side="right", padx=(0, 8))

        # 컬럼 헤더
        column_header = tk.Frame(profile_card, bg="#F9FAFB", height=42)
        column_header.pack(fill="x", padx=10)
        column_header.pack_propagate(False)

        column_header.grid_columnconfigure(0, minsize=54)
        column_header.grid_columnconfigure(1, minsize=125)
        column_header.grid_columnconfigure(2, weight=1, minsize=180)
        column_header.grid_columnconfigure(3, minsize=112)
        column_header.grid_columnconfigure(4, minsize=92)
        column_header.grid_columnconfigure(5, minsize=120)

        headers = [
            ("선택", 0, "center"),
            ("브라우저", 1, "w"),
            ("프로필 이름", 2, "w"),
            ("프로필 폴더", 3, "w"),
            ("최근 사용", 4, "center"),
            ("실제 상태", 5, "center"),
        ]
        for text, column, anchor in headers:
            tk.Label(
                column_header,
                text=text,
                font=self.bold_font,
                bg="#F9FAFB",
                fg="#475467",
                anchor=anchor,
            ).grid(row=0, column=column, sticky="nsew", padx=5, pady=9)

        # 긴 목록을 위한 스크롤 영역
        list_container = tk.Frame(profile_card, bg="#FFFFFF")
        list_container.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.profile_canvas = tk.Canvas(
            list_container,
            bg="#FFFFFF",
            highlightthickness=0,
            borderwidth=0,
        )
        scrollbar = tk.Scrollbar(
            list_container,
            orient="vertical",
            command=self.profile_canvas.yview,
            width=17,
        )
        self.profile_canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self.profile_canvas.pack(side="left", fill="both", expand=True)

        self.profile_list_frame = tk.Frame(self.profile_canvas, bg="#FFFFFF")
        self.profile_window_id = self.profile_canvas.create_window(
            (0, 0),
            window=self.profile_list_frame,
            anchor="nw",
        )

        self.profile_list_frame.bind(
            "<Configure>",
            lambda _event: self.profile_canvas.configure(
                scrollregion=self.profile_canvas.bbox("all")
            ),
        )
        self.profile_canvas.bind(
            "<Configure>",
            lambda event: self.profile_canvas.itemconfigure(
                self.profile_window_id,
                width=event.width,
            ),
        )

        # 자식 위젯 위에 마우스가 있어도 휠 스크롤이 작동하도록 전체 바인딩
        self.bind_all("<MouseWheel>", self.on_profile_mousewheel, add="+")

        # 하단 작업 영역
        action_card = tk.Frame(
            self,
            bg="#FFFFFF",
            highlightbackground="#D0D5DD",
            highlightthickness=1,
        )
        action_card.pack(fill="x", padx=16, pady=(0, 10))

        selection_area = tk.Frame(action_card, bg="#FFFFFF")
        selection_area.pack(fill="x", padx=14, pady=(12, 8))

        tk.Label(
            selection_area,
            textvariable=self.selection_text,
            font=self.bold_font,
            bg="#FFFFFF",
            fg="#344054",
        ).pack(side="left")

        extension_area = tk.Frame(action_card, bg="#FFFFFF")
        extension_area.pack(fill="x", padx=14, pady=(0, 9))

        tk.Label(
            extension_area,
            text="익스텐션 폴더",
            font=self.bold_font,
            bg="#FFFFFF",
            fg="#344054",
        ).pack(side="left", padx=(0, 9))

        self.extension_entry = tk.Entry(
            extension_area,
            textvariable=self.extension_path_var,
            font=self.small_font,
            bg="#F9FAFB",
            fg="#344054",
            relief="flat",
            highlightthickness=1,
            highlightbackground="#D0D5DD",
            highlightcolor="#4F46E5",
        )
        self.extension_entry.pack(
            side="left",
            fill="x",
            expand=True,
            ipady=7,
        )

        self.make_button(
            extension_area,
            "폴더 선택",
            self.browse_extension_folder,
            kind="normal",
            padx=12,
            pady=8,
            font=self.small_font,
        ).pack(side="left", padx=(8, 0))

        self.make_button(
            extension_area,
            "테스트용",
            self.use_test_extension,
            kind="success",
            padx=12,
            pady=8,
            font=self.small_font,
        ).pack(side="left", padx=(7, 0))

        target_buttons = tk.Frame(action_card, bg="#FFFFFF")
        target_buttons.pack(fill="x", padx=14, pady=(0, 10))

        self.enable_button = self.make_button(
            target_buttons,
            "개발자 모드 켜기",
            lambda: self.set_target_state(True),
            kind="success",
            padx=15,
            pady=9,
            font=self.default_font,
        )
        self.enable_button.pack(side="left")

        self.disable_button = self.make_button(
            target_buttons,
            "개발자 모드 끄기",
            lambda: self.set_target_state(False),
            kind="normal",
            padx=15,
            pady=9,
            font=self.default_font,
        )
        self.disable_button.pack(side="left", padx=(8, 0))

        self.make_button(
            target_buttons,
            "개발자 모드 켜기 + 익스텐션 설치",
            self.install_selected_extension,
            kind="dark",
            padx=17,
            pady=10,
        ).pack(side="right")

        self.make_button(
            target_buttons,
            "선택 프로필 적용",
            self.apply_actual_state,
            kind="primary",
            padx=17,
            pady=10,
        ).pack(side="right", padx=(0, 8))

        self.make_button(
            target_buttons,
            "실제 상태 확인",
            self.check_actual_state,
            kind="normal",
            padx=17,
            pady=10,
        ).pack(side="right", padx=(0, 8))

        tk.Label(
            self,
            textvariable=self.status_text,
            font=self.default_font,
            bg="#EEF2FF",
            fg="#3730A3",
            anchor="w",
            padx=13,
            pady=8,
        ).pack(fill="x", padx=16, pady=(0, 10))

        self.update_target_buttons()

    def save_extension_path(self, path: Path) -> None:
        self.extension_path_var.set(str(path))
        self.config_data["extension_path"] = str(path)
        try:
            save_config(self.config_data)
        except Exception as exc:
            self.status_text.set(f"익스텐션 경로 저장 실패: {exc}")

    def browse_extension_folder(self) -> None:
        initial = self.extension_path_var.get().strip()
        initial_dir = initial if Path(initial).is_dir() else str(Path.home())
        selected = filedialog.askdirectory(
            parent=self,
            title="manifest.json이 있는 익스텐션 폴더 선택",
            initialdir=initial_dir,
            mustexist=True,
        )
        if not selected:
            return

        path = Path(selected).resolve()
        valid, _name, detail = validate_extension_directory(path)
        if not valid:
            messagebox.showerror("익스텐션 폴더 오류", detail)
            return

        self.save_extension_path(path)
        self.status_text.set(f"설치할 익스텐션: {detail}")

    def use_test_extension(self) -> None:
        try:
            path = prepare_bundled_test_extension()
        except Exception as exc:
            messagebox.showerror(
                "테스트 익스텐션 준비 실패",
                str(exc),
            )
            return

        self.test_extension_path = path
        self.save_extension_path(path)
        _valid, _name, detail = validate_extension_directory(path)
        self.status_text.set(f"테스트 익스텐션 선택: {detail}")

    def selected_extension_directory(self) -> tuple[Path | None, str, str]:
        raw = self.extension_path_var.get().strip().strip('"')
        if not raw:
            return None, "", "설치할 익스텐션 폴더를 선택하세요."

        path = Path(raw).expanduser()
        valid, name, detail = validate_extension_directory(path)
        if not valid:
            return None, "", detail
        return path.resolve(), name, detail

    def set_browser_filter(self, name: str) -> None:
        self.browser_filter.set(name)
        self.update_browser_buttons()
        self.render_profiles()

    def update_browser_buttons(self) -> None:
        selected = self.browser_filter.get()
        palettes = {
            "전체": ("#475467", "#FFFFFF", "#344054", "#F2F4F7", "#475467"),
            "Google Chrome": (
                "#4285F4", "#FFFFFF", "#3367D6", "#E8F0FE", "#4285F4"
            ),
            "Microsoft Edge": (
                "#0EA5E9", "#FFFFFF", "#0284C7", "#E0F2FE", "#0EA5E9"
            ),
            "NAVER Whale": (
                "#16A34A", "#FFFFFF", "#15803D", "#DCFCE7", "#16A34A"
            ),
        }

        for name, button in self.browser_buttons.items():
            active_bg, active_fg, active_hover, pale_bg, border = palettes[name]
            if name == selected:
                button.set_colors(
                    background=active_bg,
                    foreground=active_fg,
                    hover_background=active_hover,
                    border_color=border,
                )
            else:
                button.set_colors(
                    background=pale_bg,
                    foreground=border,
                    hover_background="#FFFFFF",
                    border_color=border,
                )

    def set_target_state(self, enabled: bool) -> None:
        self.target_state = enabled
        self.update_target_buttons()

    def update_target_buttons(self) -> None:
        if self.target_state:
            self.enable_button.configure(
                bg="#039855",
                fg="#FFFFFF",
                activebackground="#027A48",
                activeforeground="#FFFFFF",
                highlightbackground="#039855",
            )
            self.disable_button.configure(
                bg="#FFFFFF",
                fg="#344054",
                activebackground="#F2F4F7",
                activeforeground="#101828",
                highlightbackground="#D0D5DD",
            )
        else:
            self.enable_button.configure(
                bg="#FFFFFF",
                fg="#344054",
                activebackground="#F2F4F7",
                activeforeground="#101828",
                highlightbackground="#D0D5DD",
            )
            self.disable_button.configure(
                bg="#D92D20",
                fg="#FFFFFF",
                activebackground="#B42318",
                activeforeground="#FFFFFF",
                highlightbackground="#D92D20",
            )

    def profile_paths(self, browser: BrowserSpec) -> list[tuple[Path, str]]:
        entries = [
            (path, "자동 검색") for path in browser.default_user_data_paths
        ]

        # 이전 버전에서 저장한 등록 경로는 자동으로 계속 사용합니다.
        custom = self.config_data.get("custom_paths", {})
        if isinstance(custom, dict):
            values = custom.get(browser.key, [])
            if isinstance(values, list):
                entries.extend(
                    (Path(str(value)), "등록 경로") for value in values
                )

        result: list[tuple[Path, str]] = []
        seen: set[str] = set()
        for path, source in entries:
            key = str(path).lower()
            if key not in seen:
                seen.add(key)
                result.append((path, source))
        return result

    def refresh_profiles(self) -> None:
        previous = {
            identity: (profile.actual_state, profile.status_message)
            for identity, profile in self.profiles.items()
        }

        found: dict[str, Profile] = {}
        for browser in self.specs:
            for path, source in self.profile_paths(browser):
                for profile in discover_profiles(browser, path, source):
                    if profile.identity in previous:
                        profile.actual_state, profile.status_message = previous[
                            profile.identity
                        ]
                    existing = found.get(profile.identity)
                    if existing is None or source == "등록 경로":
                        found[profile.identity] = profile

        self.profiles = found
        self.checked_profiles.intersection_update(found.keys())
        self.render_profiles()

        if found:
            self.status_text.set(
                f"프로필 {len(found)}개를 찾았습니다. "
                "목록의 선택 버튼으로 변경할 프로필을 고르세요."
            )
        else:
            self.status_text.set(
                "브라우저 프로필을 찾지 못했습니다. "
                "브라우저를 한 번 실행한 후 프로그램을 다시 시작하세요."
            )

    def visible_profiles(self) -> list[Profile]:
        selected_browser = self.browser_filter.get()
        profiles = [
            profile
            for profile in self.profiles.values()
            if selected_browser == "전체"
            or profile.browser.display_name == selected_browser
        ]
        profiles.sort(
            key=lambda profile: (
                profile.browser.display_name,
                0 if profile.is_last_used else 1,
                profile_sort_key(profile.directory_name),
            )
        )
        return profiles

    def clear_profile_rows(self) -> None:
        for child in self.profile_list_frame.winfo_children():
            child.destroy()
        self.profile_rows.clear()

    def render_profiles(self) -> None:
        self.clear_profile_rows()
        self.profile_check_vars.clear()

        profiles = self.visible_profiles()
        if not profiles:
            tk.Label(
                self.profile_list_frame,
                text="표시할 프로필이 없습니다.",
                font=self.default_font,
                bg="#FFFFFF",
                fg="#667085",
                pady=32,
            ).pack(fill="x")
            self.update_selection_text()
            return

        for index, profile in enumerate(profiles):
            row_bg = "#FFFFFF" if index % 2 == 0 else "#FCFCFD"
            selected = profile.identity in self.checked_profiles

            row = tk.Frame(
                self.profile_list_frame,
                bg=row_bg,
                height=56,
            )
            row.pack(fill="x")
            row.pack_propagate(False)

            row.grid_columnconfigure(0, minsize=54)
            row.grid_columnconfigure(1, minsize=125)
            row.grid_columnconfigure(2, weight=1, minsize=180)
            row.grid_columnconfigure(3, minsize=112)
            row.grid_columnconfigure(4, minsize=92)
            row.grid_columnconfigure(5, minsize=120)

            check_var = tk.BooleanVar(value=selected)
            self.profile_check_vars[profile.identity] = check_var

            checkbox = tk.Checkbutton(
                row,
                variable=check_var,
                command=lambda identity=profile.identity: (
                    self.on_profile_checkbox(identity)
                ),
                bg=row_bg,
                activebackground=row_bg,
                selectcolor="#FFFFFF",
                fg="#4F46E5",
                activeforeground="#4F46E5",
                highlightthickness=0,
                borderwidth=0,
                font=(self.font_family, 13),
                cursor="hand2",
                padx=8,
                pady=8,
            )
            checkbox.grid(row=0, column=0, sticky="nsew")

            tk.Label(
                row,
                text=profile.browser.display_name,
                font=self.default_font,
                bg=row_bg,
                fg="#344054",
                anchor="w",
            ).grid(row=0, column=1, sticky="nsew", padx=5)

            tk.Label(
                row,
                text=profile.display_name,
                font=self.profile_font,
                bg=row_bg,
                fg="#101828",
                anchor="w",
            ).grid(row=0, column=2, sticky="nsew", padx=5)

            tk.Label(
                row,
                text=profile.directory_name,
                font=self.default_font,
                bg=row_bg,
                fg="#475467",
                anchor="w",
            ).grid(row=0, column=3, sticky="nsew", padx=5)

            tk.Label(
                row,
                text="최근" if profile.is_last_used else "—",
                font=self.bold_font if profile.is_last_used else self.default_font,
                bg=row_bg,
                fg="#4338CA" if profile.is_last_used else "#98A2B3",
            ).grid(row=0, column=4, sticky="nsew", padx=5)

            if profile.actual_state is True:
                state_text, state_bg, state_fg = "● 켜짐", "#ECFDF3", "#027A48"
            elif profile.actual_state is False:
                state_text, state_bg, state_fg = "○ 꺼짐", "#FEF3F2", "#B42318"
            else:
                state_text, state_bg, state_fg = "확인 필요", "#F2F4F7", "#475467"

            tk.Label(
                row,
                text=state_text,
                font=self.bold_font,
                bg=state_bg,
                fg=state_fg,
                padx=7,
                pady=5,
            ).grid(row=0, column=5, padx=8, pady=11)

            tk.Frame(
                self.profile_list_frame,
                bg="#EAECF0",
                height=1,
            ).pack(fill="x")

            # 행 안의 모든 요소에서 마우스휠이 작동하도록 연결합니다.
            for widget in row.winfo_children():
                widget.bind("<MouseWheel>", self.on_profile_mousewheel, add="+")
            row.bind("<MouseWheel>", self.on_profile_mousewheel, add="+")

            self.profile_rows[profile.identity] = {
                "row": row,
                "checkbox": checkbox,
                "state": state_text,
            }

        self.profile_list_frame.update_idletasks()
        self.profile_canvas.configure(
            scrollregion=self.profile_canvas.bbox("all")
        )
        self.update_selection_text()

    def on_profile_checkbox(self, identity: str) -> None:
        variable = self.profile_check_vars.get(identity)
        if variable is None:
            return

        if variable.get():
            self.checked_profiles.add(identity)
        else:
            self.checked_profiles.discard(identity)
        self.update_selection_text()

    def on_profile_mousewheel(self, event: Any) -> str:
        if self.profile_canvas.winfo_exists():
            delta = int(-1 * (event.delta / 120))
            self.profile_canvas.yview_scroll(delta, "units")
        return "break"

    def toggle_profile(self, identity: str) -> None:
        if identity in self.checked_profiles:
            self.checked_profiles.remove(identity)
        else:
            self.checked_profiles.add(identity)
        self.render_profiles()

    def check_all_visible(self) -> None:
        for profile in self.visible_profiles():
            self.checked_profiles.add(profile.identity)
        self.render_profiles()

    def clear_checks(self) -> None:
        self.checked_profiles.clear()
        self.render_profiles()

    def selected_profiles(self) -> list[Profile]:
        return [
            profile
            for identity, profile in self.profiles.items()
            if identity in self.checked_profiles
        ]

    def update_selection_text(self) -> None:
        profiles = self.selected_profiles()
        if not profiles:
            self.selection_text.set("선택된 프로필이 없습니다.")
        elif len(profiles) == 1:
            profile = profiles[0]
            self.selection_text.set(
                f"1개 선택 · {profile.browser.display_name} / "
                f"{profile.display_name}"
            )
        else:
            browser_count = len({profile.browser.key for profile in profiles})
            self.selection_text.set(
                f"{len(profiles)}개 프로필 선택 · {browser_count}개 브라우저"
            )

    def center_popup(
        self,
        popup: tk.Toplevel,
        width: int,
        height: int,
    ) -> None:
        self.update_idletasks()
        parent_x = self.winfo_rootx()
        parent_y = self.winfo_rooty()
        parent_width = self.winfo_width()
        parent_height = self.winfo_height()

        x = parent_x + max((parent_width - width) // 2, 0)
        y = parent_y + max((parent_height - height) // 2, 0)
        popup.geometry(f"{width}x{height}+{x}+{y}")

    def show_browser_close_popup(
        self,
        operation: str,
        browsers: list[str],
    ) -> bool:
        """기본 메시지박스보다 약 20% 이상 큰 브라우저 종료 확인창."""
        result = {"confirmed": False}

        popup = tk.Toplevel(self)
        popup.title("브라우저 종료 확인")
        popup.configure(bg="#FFFFFF")
        popup.resizable(False, False)
        popup.transient(self)
        popup.grab_set()
        self.center_popup(popup, 600, 360)

        top_bar = tk.Frame(popup, bg="#FFF7ED", height=76)
        top_bar.pack(fill="x")
        top_bar.pack_propagate(False)

        tk.Label(
            top_bar,
            text="!",
            font=(self.font_family, 25, "bold"),
            bg="#F97316",
            fg="#FFFFFF",
            width=3,
            height=1,
        ).pack(side="left", padx=(22, 15), pady=14)

        title_area = tk.Frame(top_bar, bg="#FFF7ED")
        title_area.pack(side="left", fill="y", pady=11)
        tk.Label(
            title_area,
            text="브라우저를 종료할까요?",
            font=(self.font_family, 17, "bold"),
            bg="#FFF7ED",
            fg="#9A3412",
        ).pack(anchor="w")
        tk.Label(
            title_area,
            text=f"{operation}을 진행하기 전에 실행 중인 창을 종료합니다.",
            font=(self.font_family, 12),
            bg="#FFF7ED",
            fg="#C2410C",
        ).pack(anchor="w", pady=(3, 0))

        content = tk.Frame(popup, bg="#FFFFFF")
        content.pack(fill="both", expand=True, padx=28, pady=20)

        tk.Label(
            content,
            text="종료 대상 브라우저",
            font=(self.font_family, 13, "bold"),
            bg="#FFFFFF",
            fg="#101828",
        ).pack(anchor="w")

        browser_box = tk.Frame(
            content,
            bg="#F9FAFB",
            highlightbackground="#EAECF0",
            highlightthickness=1,
        )
        browser_box.pack(fill="x", pady=(9, 13))

        tk.Label(
            browser_box,
            text="\n".join(f"●  {browser}" for browser in browsers),
            font=(self.font_family, 13, "bold"),
            bg="#F9FAFB",
            fg="#344054",
            justify="left",
            anchor="w",
            padx=16,
            pady=12,
        ).pack(fill="x")

        tk.Label(
            content,
            text="저장하지 않은 입력이나 작업 내용은 사라질 수 있습니다.",
            font=(self.font_family, 12, "bold"),
            bg="#FFFFFF",
            fg="#B42318",
        ).pack(anchor="w")

        button_area = tk.Frame(popup, bg="#FFFFFF")
        button_area.pack(fill="x", padx=28, pady=(0, 22))

        def confirm() -> None:
            result["confirmed"] = True
            popup.destroy()

        def cancel() -> None:
            popup.destroy()

        tk.Button(
            button_area,
            text="취소",
            command=cancel,
            font=(self.font_family, 12, "bold"),
            bg="#FFFFFF",
            fg="#344054",
            activebackground="#F2F4F7",
            relief="flat",
            highlightthickness=1,
            highlightbackground="#D0D5DD",
            padx=24,
            pady=10,
            cursor="hand2",
        ).pack(side="right")

        tk.Button(
            button_area,
            text="종료 후 계속",
            command=confirm,
            font=(self.font_family, 12, "bold"),
            bg="#F97316",
            fg="#FFFFFF",
            activebackground="#EA580C",
            activeforeground="#FFFFFF",
            relief="flat",
            borderwidth=0,
            padx=24,
            pady=11,
            cursor="hand2",
        ).pack(side="right", padx=(0, 10))

        popup.protocol("WM_DELETE_WINDOW", cancel)
        popup.bind("<Escape>", lambda _event: cancel())
        popup.bind("<Return>", lambda _event: confirm())
        popup.focus_force()
        popup.wait_window()
        return bool(result["confirmed"])

    def show_apply_result_popup(
        self,
        *,
        successes: int,
        failures: list[str],
        target: bool,
        operation: str = "developer_mode",
        extension_name: str = "",
    ) -> None:
        """개발자 모드 변경 또는 익스텐션 설치 결과 창."""
        has_failures = bool(failures)
        width = 640
        height = 470 if has_failures else 360

        popup = tk.Toplevel(self)
        popup.title("반영 결과")
        popup.configure(bg="#FFFFFF")
        popup.resizable(False, False)
        popup.transient(self)
        popup.grab_set()
        self.center_popup(popup, width, height)

        accent_bg = "#FEF3F2" if has_failures else "#ECFDF3"
        accent = "#D92D20" if has_failures else "#039855"
        title_color = "#B42318" if has_failures else "#027A48"
        icon_text = "!" if has_failures else "✓"

        top_bar = tk.Frame(popup, bg=accent_bg, height=82)
        top_bar.pack(fill="x")
        top_bar.pack_propagate(False)

        tk.Label(
            top_bar,
            text=icon_text,
            font=(self.font_family, 25, "bold"),
            bg=accent,
            fg="#FFFFFF",
            width=3,
            height=1,
        ).pack(side="left", padx=(22, 15), pady=16)

        title_area = tk.Frame(top_bar, bg=accent_bg)
        title_area.pack(side="left", fill="y", pady=12)

        tk.Label(
            title_area,
            text=(
                "일부 프로필 설치 실패"
                if has_failures and operation == "extension_install"
                else "일부 프로필 적용 실패"
                if has_failures
                else "자동 설치가 완료되었습니다"
                if operation == "extension_install"
                else "반영이 완료되었습니다"
            ),
            font=(self.font_family, 17, "bold"),
            bg=accent_bg,
            fg=title_color,
        ).pack(anchor="w")

        tk.Label(
            title_area,
            text=(
                f"'{extension_name}' 익스텐션 설치 작업 결과입니다."
                if operation == "extension_install"
                else f"개발자 모드 {'켜기' if target else '끄기'} 작업 결과입니다."
            ),
            font=(self.font_family, 12),
            bg=accent_bg,
            fg=title_color,
        ).pack(anchor="w", pady=(3, 0))

        content = tk.Frame(popup, bg="#FFFFFF")
        content.pack(fill="both", expand=True, padx=28, pady=20)

        summary = tk.Frame(
            content,
            bg="#F9FAFB",
            highlightbackground="#EAECF0",
            highlightthickness=1,
        )
        summary.pack(fill="x")

        tk.Label(
            summary,
            text=f"성공  {successes}개",
            font=(self.font_family, 15, "bold"),
            bg="#F9FAFB",
            fg="#027A48",
            padx=20,
            pady=14,
        ).pack(side="left")

        tk.Label(
            summary,
            text=f"실패  {len(failures)}개",
            font=(self.font_family, 15, "bold"),
            bg="#F9FAFB",
            fg="#B42318" if has_failures else "#98A2B3",
            padx=20,
            pady=14,
        ).pack(side="left")

        if has_failures:
            tk.Label(
                content,
                text="오류 내용",
                font=(self.font_family, 13, "bold"),
                bg="#FFFFFF",
                fg="#101828",
            ).pack(anchor="w", pady=(16, 7))

            error_frame = tk.Frame(
                content,
                bg="#F9FAFB",
                highlightbackground="#EAECF0",
                highlightthickness=1,
            )
            error_frame.pack(fill="both", expand=True)

            error_text = tk.Text(
                error_frame,
                font=(self.font_family, 11),
                bg="#F9FAFB",
                fg="#344054",
                relief="flat",
                borderwidth=0,
                wrap="word",
                padx=12,
                pady=10,
                height=8,
            )
            error_scroll = tk.Scrollbar(
                error_frame,
                orient="vertical",
                command=error_text.yview,
            )
            error_text.configure(yscrollcommand=error_scroll.set)
            error_scroll.pack(side="right", fill="y")
            error_text.pack(side="left", fill="both", expand=True)
            error_text.insert("1.0", "\n\n".join(failures))
            error_text.configure(state="disabled")
        else:
            tk.Label(
                content,
                text=(
                    f"선택한 {successes}개 프로필에\n"
                    f"'{extension_name}' 익스텐션을 불러왔습니다."
                    if operation == "extension_install"
                    else f"선택한 {successes}개 프로필의 개발자 모드가\n"
                    f"{'켜짐' if target else '꺼짐'} 상태로 정상 반영되었습니다."
                ),
                font=(self.font_family, 14, "bold"),
                bg="#FFFFFF",
                fg="#344054",
                justify="center",
                pady=25,
            ).pack(fill="x")

        button_area = tk.Frame(popup, bg="#FFFFFF")
        button_area.pack(fill="x", padx=28, pady=(0, 22))

        tk.Button(
            button_area,
            text="확인",
            command=popup.destroy,
            font=(self.font_family, 12, "bold"),
            bg="#4F46E5",
            fg="#FFFFFF",
            activebackground="#4338CA",
            activeforeground="#FFFFFF",
            relief="flat",
            borderwidth=0,
            padx=34,
            pady=11,
            cursor="hand2",
        ).pack(side="right")

        popup.bind("<Escape>", lambda _event: popup.destroy())
        popup.bind("<Return>", lambda _event: popup.destroy())
        popup.focus_force()
        popup.wait_window()

    def confirm_browser_close(
        self,
        profiles: list[Profile],
        operation: str,
    ) -> bool:
        browsers = sorted({profile.browser.display_name for profile in profiles})
        return self.show_browser_close_popup(operation, browsers)

    def check_actual_state(self) -> None:
        profiles = self.selected_profiles()
        if not profiles:
            messagebox.showwarning(
                "프로필 선택",
                "목록의 '선택' 버튼으로 확인할 프로필을 선택하세요.",
            )
            return

        if not self.confirm_browser_close(profiles, "실제 상태 확인"):
            return

        failures: list[str] = []
        for index, profile in enumerate(profiles, 1):
            self.status_text.set(
                f"[{index}/{len(profiles)}] {profile.browser.display_name} · "
                f"{profile.display_name} 상태 확인 중..."
            )
            self.update_idletasks()

            ok, state, detail = perform_browser_operation(profile, None)
            if ok:
                profile.actual_state = state
                profile.status_message = detail
            else:
                profile.actual_state = None
                profile.status_message = "확인 실패"
                failures.append(
                    f"• {profile.browser.display_name} / "
                    f"{profile.display_name}\n{detail}"
                )
            self.render_profiles()

        if failures:
            messagebox.showerror("일부 확인 실패", "\n\n".join(failures))
        else:
            messagebox.showinfo(
                "확인 완료",
                "선택한 프로필의 실제 개발자 모드 상태를 확인했습니다.",
            )
        self.status_text.set("실제 상태 확인이 완료되었습니다.")

    def install_selected_extension(self) -> None:
        profiles = self.selected_profiles()
        if not profiles:
            messagebox.showwarning(
                "프로필 선택",
                "목록의 '선택' 버튼으로 설치할 프로필을 선택하세요.",
            )
            return

        extension_path, extension_name, detail = (
            self.selected_extension_directory()
        )
        if extension_path is None:
            messagebox.showerror("익스텐션 폴더 오류", detail)
            return

        self.save_extension_path(extension_path)

        if not self.confirm_browser_close(
            profiles,
            "개발자 모드 켜기 및 익스텐션 자동 설치",
        ):
            return

        successes = 0
        failures: list[str] = []
        for index, profile in enumerate(profiles, 1):
            self.status_text.set(
                f"[{index}/{len(profiles)}] {profile.browser.display_name} · "
                f"{profile.display_name}에 '{extension_name}' 설치 중..."
            )
            self.update_idletasks()

            ok, state, operation_detail = perform_browser_operation(
                profile,
                True,
                extension_path,
            )
            profile.actual_state = state
            if ok:
                successes += 1
                profile.status_message = operation_detail
            else:
                profile.status_message = "익스텐션 설치 실패"
                failures.append(
                    f"• {profile.browser.display_name} / "
                    f"{profile.display_name}\n{operation_detail}"
                )
            self.render_profiles()

        self.show_apply_result_popup(
            successes=successes,
            failures=failures,
            target=True,
            operation="extension_install",
            extension_name=extension_name,
        )
        self.status_text.set(
            f"익스텐션 설치 완료 · 성공 {successes}개 · 실패 {len(failures)}개"
        )

    def apply_actual_state(self) -> None:
        profiles = self.selected_profiles()
        if not profiles:
            messagebox.showwarning(
                "프로필 선택",
                "목록의 '선택' 버튼으로 적용할 프로필을 선택하세요.",
            )
            return

        if not self.confirm_browser_close(profiles, "개발자 모드 변경"):
            return

        target = self.target_state
        successes = 0
        failures: list[str] = []

        for index, profile in enumerate(profiles, 1):
            self.status_text.set(
                f"[{index}/{len(profiles)}] {profile.browser.display_name} · "
                f"{profile.display_name} 변경 중..."
            )
            self.update_idletasks()

            ok, state, detail = perform_browser_operation(profile, target)
            profile.actual_state = state
            if ok:
                successes += 1
                profile.status_message = detail
            else:
                profile.status_message = "적용 실패"
                failures.append(
                    f"• {profile.browser.display_name} / "
                    f"{profile.display_name}\n{detail}"
                )
            self.render_profiles()

        self.show_apply_result_popup(
            successes=successes,
            failures=failures,
            target=target,
        )

        self.status_text.set(
            f"작업 완료 · 성공 {successes}개 · 실패 {len(failures)}개"
        )



def dependency_error() -> str | None:
    missing = []
    if psutil is None:
        missing.append("psutil")
    if Desktop is None or send_keys is None:
        missing.append("pywinauto")
    if missing:
        return (
            "필수 패키지가 설치되지 않았습니다: "
            + ", ".join(missing)
            + "\n\ninstall_and_run.bat을 실행하세요."
        )
    return None


def main() -> int:
    if platform.system() != "Windows":
        print("Windows에서만 실행할 수 있습니다.", file=sys.stderr)
        return 1

    error = dependency_error()
    if error:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(APP_NAME, error)
        root.destroy()
        return 1

    app = App()
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
