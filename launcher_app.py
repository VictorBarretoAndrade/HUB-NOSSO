"""
Biofeedback Hub: Executável Unificado
Inicia e gerencia toda a stack (Hub :8787, Dashboard :5173, Simulador HRV-ECG,
Driver Polar H10 :8765, Ponte Polar e Exportador .npy/.mat) com um único clique,
seguindo o design system "Clinical Console" do Biofeedback Hub.
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import logging
import os
from pathlib import Path
import queue
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser


# ---------------------------------------------------------------------------
# Resolução de caminhos (funciona em Python normal e empacotado via PyInstaller)
# ---------------------------------------------------------------------------

def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def app_root_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def bundle_dir() -> Path:
    if is_frozen() and hasattr(sys, "_MEIPASS"):
        return Path(getattr(sys, "_MEIPASS")).resolve()
    return app_root_dir()


def resolve_sessions_dir() -> Path:
    root = app_root_dir()
    hub_ue_sessions = root / "hub-ue" / "data" / "sessions"
    if (root / "hub-ue").exists():
        hub_ue_sessions.mkdir(parents=True, exist_ok=True)
        return hub_ue_sessions
    local_sessions = root / "data" / "sessions"
    local_sessions.mkdir(parents=True, exist_ok=True)
    return local_sessions


def resolve_dashboard_dist() -> Path:
    candidates = [
        app_root_dir() / "hub-ue" / "apps" / "dashboard" / "dist",
        bundle_dir() / "dashboard_dist",
        bundle_dir() / "hub-ue" / "apps" / "dashboard" / "dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").exists():
            return candidate
    return candidates[0]


def resolve_polar_dir() -> Path:
    candidates = [
        app_root_dir() / "polarh10_driver",
        bundle_dir() / "polarh10_driver",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def resolve_asset(filename: str) -> Path | None:
    candidates = [
        app_root_dir() / "assets" / filename,
        bundle_dir() / "assets" / filename,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def setup_python_paths() -> None:
    root = app_root_dir()
    bdir = bundle_dir()
    paths_to_add = [
        root / "hub-ue" / "apps" / "hub" / "src",
        root / "polarh10_driver",
        bdir / "hub_src",
        bdir / "polarh10_driver",
    ]
    for p in paths_to_add:
        if p.exists() and str(p) not in sys.path:
            sys.path.insert(0, str(p))


setup_python_paths()


# ---------------------------------------------------------------------------
# Servidor HTTP estático do Dashboard React (SPA)
# ---------------------------------------------------------------------------

class SpaRequestHandler(SimpleHTTPRequestHandler):
    """Serve o build estático do Dashboard React com fallback SPA para index.html."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:
        request_path = self.path.split("?", 1)[0].split("#", 1)[0]
        full_path = Path(self.translate_path(request_path))
        if not full_path.exists() and "." not in full_path.name:
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, fmt: str, *args: object) -> None:
        pass


def run_worker_export(argv: list[str]) -> None:
    polar_dir = resolve_polar_dir()
    if str(polar_dir) not in sys.path:
        sys.path.insert(0, str(polar_dir))
    from tools.export_cli import main as export_main

    export_main(argv)


# ---------------------------------------------------------------------------
# Utilitários de rede e processos
# ---------------------------------------------------------------------------

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.35)
        return s.connect_ex((host, port)) == 0


def free_port_on_windows(port: int) -> None:
    """Encerra processos externos que estejam ocupando a porta especificada."""
    if os.name != "nt":
        return
    try:
        cmd = (
            f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | "
            "Select-Object -ExpandProperty OwningProcess -Unique"
        )
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command", cmd],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
            timeout=5,
        )
        my_pid = os.getpid()
        for line in res.stdout.splitlines():
            line = line.strip()
            if line.isdigit():
                pid = int(line)
                if pid > 0 and pid != my_pid:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(pid)],
                        capture_output=True,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                        timeout=5,
                    )
    except Exception:
        pass


def fetch_hub_health(port: int = 8787) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None
    return None


class QueueStream(io.TextIOBase):
    """Redireciona print/logging para a fila da interface gráfica."""

    def __init__(self, log_queue: queue.Queue[str]) -> None:
        self.log_queue = log_queue
        self._buf = ""

    def write(self, s: str) -> int:
        if not s:
            return 0
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            clean = line.rstrip()
            if clean:
                timestamp = time.strftime("%H:%M:%S")
                self.log_queue.put(f"[{timestamp}] {clean}\n")
        return len(s)

    def flush(self) -> None:
        if self._buf.strip():
            timestamp = time.strftime("%H:%M:%S")
            self.log_queue.put(f"[{timestamp}] {self._buf.strip()}\n")
        self._buf = ""


# ---------------------------------------------------------------------------
# Paleta "Clinical Console" (idêntica a hub-ue/apps/dashboard/src/styles/tokens.css)
# ---------------------------------------------------------------------------

TOKENS = {
    "bg": "#f3f5f9",
    "surface": "#ffffff",
    "surface_high": "#eef1f7",
    "surface_higher": "#e4e9f2",
    "line": "#d8dde7",
    "line_strong": "#c3cad7",
    "text": "#1b2333",
    "muted": "#616b7e",
    "primary": "#2f4d80",
    "primary_strong": "#243d66",
    "primary_soft": "#e8eef8",
    "ok": "#177a45",
    "ok_soft": "#e3f2ea",
    "ok_line": "#8bc0a3",
    "warn": "#8a5d0b",
    "warn_soft": "#f5eedf",
    "warn_line": "#c9ae7e",
    "error": "#c2362a",
    "error_soft": "#f8e6e4",
    "error_line": "#e09a94",
}


# ---------------------------------------------------------------------------
# Interface Gráfica Unificada (Tkinter — Design System Clinical Console)
# ---------------------------------------------------------------------------

class BiofeedbackLauncherApp:
    def __init__(self) -> None:
        if os.name == "nt":
            try:
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("biofeedback.hub.unified.app")
            except Exception:
                pass

        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk

        self.tk = tk
        self.ttk = ttk
        self.filedialog = filedialog
        self.messagebox = messagebox

        self.root = tk.Tk()
        self.root.title("Biofeedback Hub: Executável Unificado")
        self.root.geometry("920x680")
        self.root.minsize(480, 520)
        self.root.configure(bg=TOKENS["bg"])

        self._logo_photo: tk.PhotoImage | None = None
        self._icon_photo: tk.PhotoImage | None = None
        self._apply_window_icons()
        self._configure_ttk_styles()

        self.hub_port = 8787
        self.dashboard_port = 5173
        self.sessions_dir = resolve_sessions_dir()

        self.log_queue: queue.Queue[str] = queue.Queue()
        self.queue_stream = QueueStream(self.log_queue)
        sys.stdout = self.queue_stream  # type: ignore[assignment]
        sys.stderr = self.queue_stream  # type: ignore[assignment]

        logging.basicConfig(
            level=logging.INFO,
            format="%(message)s",
            handlers=[logging.StreamHandler(self.queue_stream)],
            force=True,
        )

        # Objetos de controle em memória (threads / loops)
        self.hub_server: object | None = None
        self.dashboard_server: ThreadingHTTPServer | None = None
        self.sensor_loop: asyncio.AbstractEventLoop | None = None
        self.sensor_thread: threading.Thread | None = None
        self.active_sensor_mode: str = "Inativo"
        self.is_real_mode: bool = False
        self.log_autoscroll: bool = True

        self.current_session_id = "—"
        self.closing = False
        self._layout_mode: str = ""

        self.export_session_var = tk.StringVar(value="")
        self.export_signal_var = tk.StringVar(value="ecg")
        self.export_format_var = tk.StringVar(value="npy")

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.bind("<Configure>", self._on_window_resize)

        # Loops periódicos da UI
        self.root.after(120, self._drain_logs)
        self.root.after(800, self._poll_status)

        # Inicia automaticamente o Modo Demo (Etapa 1 do COMO-USAR.md)
        self.root.after(300, lambda: self.start_demo_stack(open_browser=True))

    def _apply_window_icons(self) -> None:
        tk = self.tk
        ico_path = resolve_asset("logo.ico")
        if ico_path is not None and os.name == "nt":
            try:
                self.root.iconbitmap(default=str(ico_path))
            except Exception:
                pass

        png_path = resolve_asset("logo.png")
        if png_path is not None:
            try:
                self._icon_photo = tk.PhotoImage(file=str(png_path))
                self.root.iconphoto(True, self._icon_photo)
            except Exception:
                pass

        header_logo_path = resolve_asset("logo_header.png")
        if header_logo_path is not None:
            try:
                self._logo_photo = tk.PhotoImage(file=str(header_logo_path))
            except Exception:
                pass

    def _configure_ttk_styles(self) -> None:
        style = self.ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure(
            "TCombobox",
            fieldbackground=TOKENS["surface"],
            background=TOKENS["surface_high"],
            foreground=TOKENS["text"],
            bordercolor=TOKENS["line_strong"],
            arrowcolor=TOKENS["text"],
            padding=5,
        )
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", TOKENS["surface"])],
            selectbackground=[("readonly", TOKENS["primary_soft"])],
            selectforeground=[("readonly", TOKENS["text"])],
        )

    def _create_panel(self, parent: object, title_text: str) -> tuple[object, object]:
        """Cria um cartão no estilo .panel / .panel-header / .panel-body do Dashboard."""
        tk = self.tk
        outer = tk.Frame(
            parent,
            bg=TOKENS["surface"],
            highlightbackground=TOKENS["line"],
            highlightthickness=1,
            bd=0,
        )
        header = tk.Frame(outer, bg=TOKENS["surface"], padx=16, pady=10)
        header.pack(fill="x")

        lbl = tk.Label(
            header,
            text=title_text,
            font=("Segoe UI", 10, "bold"),
            fg=TOKENS["text"],
            bg=TOKENS["surface"],
            anchor="w",
        )
        lbl.pack(side="left")

        divider = tk.Frame(outer, bg=TOKENS["line"], height=1)
        divider.pack(fill="x")

        body = tk.Frame(outer, bg=TOKENS["surface"], padx=16, pady=14)
        body.pack(fill="both", expand=True)
        return outer, body

    def _build_ui(self) -> None:
        tk = self.tk
        ttk = self.ttk

        # -------------------------------------------------------------------
        # Topbar (idêntica à .topbar do Dashboard)
        # -------------------------------------------------------------------
        self.topbar = tk.Frame(
            self.root,
            bg=TOKENS["surface"],
            padx=20,
            pady=12,
        )
        self.topbar.pack(fill="x")
        self.topbar.columnconfigure(0, weight=1)

        brand_frame = tk.Frame(self.topbar, bg=TOKENS["surface"])
        brand_frame.grid(row=0, column=0, sticky="w")

        if self._logo_photo is not None:
            logo_lbl = tk.Label(brand_frame, image=self._logo_photo, bg=TOKENS["surface"])
            logo_lbl.pack(side="left", padx=(0, 12))

        title_stack = tk.Frame(brand_frame, bg=TOKENS["surface"])
        title_stack.pack(side="left")

        eyebrow_lbl = tk.Label(
            title_stack,
            text="CONSOLE DE OPERAÇÃO LOCAL",
            font=("Segoe UI", 8, "bold"),
            fg=TOKENS["muted"],
            bg=TOKENS["surface"],
            anchor="w",
        )
        eyebrow_lbl.pack(anchor="w")

        title_lbl = tk.Label(
            title_stack,
            text="Biofeedback Hub: Executável Unificado",
            font=("Segoe UI", 14, "bold"),
            fg=TOKENS["text"],
            bg=TOKENS["surface"],
            anchor="w",
        )
        title_lbl.pack(anchor="w")

        self.open_dash_btn = tk.Button(
            self.topbar,
            text="Abrir Dashboard (127.0.0.1:5173)",
            font=("Segoe UI", 9, "bold"),
            bg=TOKENS["primary"],
            fg="#ffffff",
            activebackground=TOKENS["primary_strong"],
            activeforeground="#ffffff",
            relief="flat",
            bd=0,
            padx=14,
            pady=7,
            cursor="hand2",
            command=self.open_dashboard_browser,
        )
        self.open_dash_btn.grid(row=0, column=1, sticky="e", padx=(12, 0))

        topbar_line = tk.Frame(self.root, bg=TOKENS["line"], height=1)
        topbar_line.pack(fill="x")

        # -------------------------------------------------------------------
        # Container Principal Responsivo
        # -------------------------------------------------------------------
        self.main_container = tk.Frame(self.root, bg=TOKENS["bg"], padx=18, pady=14)
        self.main_container.pack(fill="both", expand=True)
        self.main_container.columnconfigure(0, weight=1)
        self.main_container.rowconfigure(3, weight=1)

        # 1) Faixa de Prontidão do Sistema (.readiness-row)
        self.status_panel, self.status_body = self._create_panel(
            self.main_container, "Prontidão do sistema"
        )
        self.status_panel.grid(row=0, column=0, sticky="ew", pady=(0, 12))

        self.hub_cell, self.hub_title_lbl, self.hub_val_lbl = self._create_readiness_cell(
            self.status_body, "HUB (:8787)", "Iniciando..."
        )
        self.dash_cell, self.dash_title_lbl, self.dash_val_lbl = self._create_readiness_cell(
            self.status_body, "DASHBOARD (:5173)", "Iniciando..."
        )
        self.sensor_cell, self.sensor_title_lbl, self.sensor_val_lbl = self._create_readiness_cell(
            self.status_body, "SENSOR", "Aguardando"
        )
        self.session_cell, self.session_title_lbl, self.session_val_lbl = self._create_readiness_cell(
            self.status_body, "SESSÃO ATUAL", "—"
        )

        # 2) Controle dos Serviços (sem emojis e sem checkbox de simulador Unreal)
        self.controls_panel, self.controls_body = self._create_panel(
            self.main_container, "Controle dos serviços"
        )
        self.controls_panel.grid(row=1, column=0, sticky="ew", pady=(0, 12))

        self.btn_demo = tk.Button(
            self.controls_body,
            text="Iniciar Modo Demo (Simulador HRV/ECG)",
            font=("Segoe UI", 9, "bold"),
            bg=TOKENS["primary"],
            fg="#ffffff",
            activebackground=TOKENS["primary_strong"],
            activeforeground="#ffffff",
            relief="flat",
            bd=0,
            padx=12,
            pady=8,
            cursor="hand2",
            command=lambda: self.start_demo_stack(open_browser=True),
        )

        self.btn_polar = tk.Button(
            self.controls_body,
            text="Modo Real",
            font=("Segoe UI", 9, "bold"),
            bg=TOKENS["surface_high"],
            fg=TOKENS["text"],
            activebackground=TOKENS["surface_higher"],
            activeforeground=TOKENS["text"],
            highlightbackground=TOKENS["line_strong"],
            highlightthickness=1,
            relief="solid",
            bd=1,
            padx=12,
            pady=8,
            cursor="hand2",
            command=self.open_real_mode_dialog,
        )

        self.btn_stop = tk.Button(
            self.controls_body,
            text="Parar Sensores",
            font=("Segoe UI", 9, "bold"),
            bg=TOKENS["error_soft"],
            fg=TOKENS["error"],
            activebackground=TOKENS["error_line"],
            activeforeground=TOKENS["error"],
            highlightbackground=TOKENS["error_line"],
            highlightthickness=1,
            relief="solid",
            bd=1,
            padx=12,
            pady=8,
            cursor="hand2",
            command=self.stop_sensors,
        )

        # 3) Exportar Sessão (.NPY / .MAT)
        self.export_panel, self.export_body = self._create_panel(
            self.main_container, "Exportação de sinais (.npy / .mat)"
        )
        self.export_panel.grid(row=2, column=0, sticky="ew", pady=(0, 12))

        self.sess_field = tk.Frame(self.export_body, bg=TOKENS["surface"])
        tk.Label(
            self.sess_field,
            text="SESSÃO",
            font=("Segoe UI", 8, "bold"),
            fg=TOKENS["muted"],
            bg=TOKENS["surface"],
        ).pack(anchor="w", pady=(0, 3))
        sess_row = tk.Frame(self.sess_field, bg=TOKENS["surface"])
        sess_row.pack(fill="x")
        self.session_combo = ttk.Combobox(
            sess_row,
            textvariable=self.export_session_var,
            state="normal",
        )
        self.session_combo.pack(side="left", fill="x", expand=True, padx=(0, 6))
        self.refresh_btn = tk.Button(
            sess_row,
            text="Atualizar",
            font=("Segoe UI", 8, "bold"),
            bg=TOKENS["surface_high"],
            fg=TOKENS["text"],
            activebackground=TOKENS["surface_higher"],
            relief="solid",
            bd=1,
            padx=8,
            pady=4,
            cursor="hand2",
            command=self.refresh_sessions_list,
        )
        self.refresh_btn.pack(side="left")

        self.sig_field = tk.Frame(self.export_body, bg=TOKENS["surface"])
        tk.Label(
            self.sig_field,
            text="SINAL",
            font=("Segoe UI", 8, "bold"),
            fg=TOKENS["muted"],
            bg=TOKENS["surface"],
        ).pack(anchor="w", pady=(0, 3))
        self.signal_combo = ttk.Combobox(
            self.sig_field,
            textvariable=self.export_signal_var,
            values=["ecg", "rr", "hr"],
            width=8,
            state="readonly",
        )
        self.signal_combo.pack(fill="x")

        self.fmt_field = tk.Frame(self.export_body, bg=TOKENS["surface"])
        tk.Label(
            self.fmt_field,
            text="FORMATO",
            font=("Segoe UI", 8, "bold"),
            fg=TOKENS["muted"],
            bg=TOKENS["surface"],
        ).pack(anchor="w", pady=(0, 3))
        self.fmt_combo = ttk.Combobox(
            self.fmt_field,
            textvariable=self.export_format_var,
            values=["npy", "mat"],
            width=8,
            state="readonly",
        )
        self.fmt_combo.pack(fill="x")

        self.export_actions_frame = tk.Frame(self.export_body, bg=TOKENS["surface"])
        self.export_btn = tk.Button(
            self.export_actions_frame,
            text="Exportar Arquivo",
            font=("Segoe UI", 9, "bold"),
            bg=TOKENS["primary"],
            fg="#ffffff",
            activebackground=TOKENS["primary_strong"],
            activeforeground="#ffffff",
            relief="flat",
            bd=0,
            padx=12,
            pady=6,
            cursor="hand2",
            command=self.export_session_gui,
        )
        self.export_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.open_folder_btn = tk.Button(
            self.export_actions_frame,
            text="Pasta de Sessões",
            font=("Segoe UI", 9),
            bg=TOKENS["surface_high"],
            fg=TOKENS["text"],
            activebackground=TOKENS["surface_higher"],
            relief="solid",
            bd=1,
            padx=10,
            pady=5,
            cursor="hand2",
            command=lambda: os.startfile(str(self.sessions_dir)) if os.name == "nt" else None,
        )
        self.open_folder_btn.pack(side="left", fill="x", expand=True)

        # 4) Console de Logs em Tempo Real
        self.log_panel, self.log_body = self._create_panel(
            self.main_container, "Eventos e logs do sistema"
        )
        self.log_panel.grid(row=3, column=0, sticky="nsew")

        log_header = self.log_panel.winfo_children()[0]
        self.log_scroll_btn = tk.Button(
            log_header,
            text="Pausar scroll",
            font=("Segoe UI", 8, "bold"),
            bg=TOKENS["surface_high"],
            fg=TOKENS["text"],
            activebackground=TOKENS["surface_higher"],
            activeforeground=TOKENS["text"],
            highlightbackground=TOKENS["line_strong"],
            highlightthickness=1,
            relief="solid",
            bd=1,
            padx=10,
            pady=3,
            cursor="hand2",
            command=self.toggle_log_autoscroll,
        )
        self.log_scroll_btn.pack(side="right")

        log_inner = tk.Frame(
            self.log_body,
            bg=TOKENS["surface_high"],
            highlightbackground=TOKENS["line"],
            highlightthickness=1,
        )
        log_inner.pack(fill="both", expand=True)

        self.log_text = tk.Text(
            log_inner,
            bg=TOKENS["surface_high"],
            fg=TOKENS["text"],
            insertbackground=TOKENS["text"],
            font=("Consolas", 9),
            relief="flat",
            padx=10,
            pady=8,
            wrap="word",
            height=8,
        )
        scrollbar = ttk.Scrollbar(log_inner, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.log_text.pack(side="left", fill="both", expand=True)

        self._apply_responsive_layout(920)
        self.refresh_sessions_list()

    def _create_readiness_cell(self, parent: object, label: str, value: str) -> tuple[object, object, object]:
        tk = self.tk
        cell = tk.Frame(
            parent,
            bg=TOKENS["surface_high"],
            highlightbackground=TOKENS["line"],
            highlightthickness=1,
            padx=12,
            pady=8,
        )
        lbl = tk.Label(
            cell,
            text=label,
            font=("Segoe UI", 8, "bold"),
            fg=TOKENS["muted"],
            bg=TOKENS["surface_high"],
            anchor="w",
        )
        lbl.pack(fill="x")
        val = tk.Label(
            cell,
            text=value,
            font=("Consolas", 10, "bold"),
            fg=TOKENS["text"],
            bg=TOKENS["surface_high"],
            anchor="w",
        )
        val.pack(fill="x", pady=(2, 0))
        return cell, lbl, val

    def _set_cell_tone(self, cell: object, title_lbl: object, val_lbl: object, tone: str, text: str) -> None:
        if tone == "ok":
            bg, fg, border = TOKENS["ok_soft"], TOKENS["ok"], TOKENS["ok_line"]
        elif tone == "warn":
            bg, fg, border = TOKENS["warn_soft"], TOKENS["warn"], TOKENS["warn_line"]
        elif tone == "error":
            bg, fg, border = TOKENS["error_soft"], TOKENS["error"], TOKENS["error_line"]
        else:
            bg, fg, border = TOKENS["surface_high"], TOKENS["text"], TOKENS["line"]

        cell.configure(bg=bg, highlightbackground=border)  # type: ignore[attr-defined]
        title_lbl.configure(bg=bg)  # type: ignore[attr-defined]
        val_lbl.configure(bg=bg, fg=fg, text=text)  # type: ignore[attr-defined]

    def _on_window_resize(self, event: object) -> None:
        if getattr(event, "widget", None) is self.root:
            width = getattr(event, "width", 920)
            self._apply_responsive_layout(width)

    def _apply_responsive_layout(self, width: int) -> None:
        mode = "narrow" if width < 760 else "wide"
        if mode == self._layout_mode:
            return
        self._layout_mode = mode

        # Reset grid configurations before re-gridding
        for col in range(4):
            self.status_body.columnconfigure(col, weight=0, uniform="")  # type: ignore[attr-defined]
            self.controls_body.columnconfigure(col, weight=0, uniform="")  # type: ignore[attr-defined]
            self.export_body.columnconfigure(col, weight=0, uniform="")  # type: ignore[attr-defined]

        if mode == "wide":
            # Topbar em 1 linha
            self.open_dash_btn.grid_configure(row=0, column=1, sticky="e", padx=(12, 0), pady=0)

            # Status: 4 colunas iguais
            for idx, cell in enumerate([self.hub_cell, self.dash_cell, self.sensor_cell, self.session_cell]):
                self.status_body.columnconfigure(idx, weight=1, uniform="status")  # type: ignore[attr-defined]
                cell.grid_configure(row=0, column=idx, sticky="nsew", padx=(0 if idx == 0 else 8, 0), pady=0)

            # Controles: 3 botões lado a lado com pesos iguais
            for idx, btn in enumerate([self.btn_demo, self.btn_polar, self.btn_stop]):
                self.controls_body.columnconfigure(idx, weight=1, uniform="ctrl")  # type: ignore[attr-defined]
                btn.grid_configure(row=0, column=idx, sticky="ew", padx=(0 if idx == 0 else 8, 0), pady=0)

            # Exportação: 4 colunas na mesma linha
            self.export_body.columnconfigure(0, weight=3)  # type: ignore[attr-defined]
            self.export_body.columnconfigure(1, weight=1)  # type: ignore[attr-defined]
            self.export_body.columnconfigure(2, weight=1)  # type: ignore[attr-defined]
            self.export_body.columnconfigure(3, weight=2)  # type: ignore[attr-defined]

            self.sess_field.grid_configure(row=0, column=0, columnspan=1, sticky="ew", padx=(0, 10), pady=0)
            self.sig_field.grid_configure(row=0, column=1, sticky="ew", padx=(0, 10), pady=0)
            self.fmt_field.grid_configure(row=0, column=2, sticky="ew", padx=(0, 10), pady=0)
            self.export_actions_frame.grid_configure(row=0, column=3, columnspan=1, sticky="sew", pady=(16, 0))
        else:
            # Topbar empilhada em telas estreitas / meia-tela
            self.open_dash_btn.grid_configure(row=1, column=0, columnspan=2, sticky="ew", padx=0, pady=(10, 0))

            # Status: grade 2x2
            for col in range(2):
                self.status_body.columnconfigure(col, weight=1, uniform="status")  # type: ignore[attr-defined]
            self.hub_cell.grid_configure(row=0, column=0, sticky="nsew", padx=(0, 4), pady=(0, 6))
            self.dash_cell.grid_configure(row=0, column=1, sticky="nsew", padx=(4, 0), pady=(0, 6))
            self.sensor_cell.grid_configure(row=1, column=0, sticky="nsew", padx=(0, 4), pady=0)
            self.session_cell.grid_configure(row=1, column=1, sticky="nsew", padx=(4, 0), pady=0)

            # Controles: botões empilhados com largura total (nunca cortam)
            self.controls_body.columnconfigure(0, weight=1)  # type: ignore[attr-defined]
            self.btn_demo.grid_configure(row=0, column=0, sticky="ew", padx=0, pady=(0, 6))
            self.btn_polar.grid_configure(row=1, column=0, sticky="ew", padx=0, pady=(0, 6))
            self.btn_stop.grid_configure(row=2, column=0, sticky="ew", padx=0, pady=0)

            # Exportação: empilhada em 3 linhas
            self.export_body.columnconfigure(0, weight=1)  # type: ignore[attr-defined]
            self.export_body.columnconfigure(1, weight=1)  # type: ignore[attr-defined]
            self.sess_field.grid_configure(row=0, column=0, columnspan=2, sticky="ew", padx=0, pady=(0, 8))
            self.sig_field.grid_configure(row=1, column=0, sticky="ew", padx=(0, 6), pady=(0, 8))
            self.fmt_field.grid_configure(row=1, column=1, sticky="ew", padx=(6, 0), pady=(0, 8))
            self.export_actions_frame.grid_configure(row=2, column=0, columnspan=2, sticky="ew", pady=0)

    # -----------------------------------------------------------------------
    # Gerenciamento dos Serviços em Threads (Inicialização Instantânea)
    # -----------------------------------------------------------------------

    def log(self, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        self.log_queue.put(f"[{timestamp}] {message}\n")

    def toggle_log_autoscroll(self) -> None:
        self.log_autoscroll = not self.log_autoscroll
        if self.log_autoscroll:
            self.log_scroll_btn.configure(text="Pausar scroll", bg=TOKENS["surface_high"], fg=TOKENS["text"])
            self.log_text.see("end")
        else:
            self.log_scroll_btn.configure(text="Retomar scroll", bg=TOKENS["warn_soft"], fg=TOKENS["warn"])

    def _drain_logs(self) -> None:
        try:
            while True:
                line = self.log_queue.get_nowait()
                self.log_text.insert("end", line)
                if self.log_autoscroll:
                    self.log_text.see("end")
        except queue.Empty:
            pass
        if not self.closing:
            self.root.after(120, self._drain_logs)

    def _stop_hub_server(self) -> None:
        server = self.hub_server
        self.hub_server = None
        if server is not None and hasattr(server, "should_exit"):
            setattr(server, "should_exit", True)
            for _ in range(30):
                if not is_port_in_use(self.hub_port):
                    break
                time.sleep(0.15)
        if is_port_in_use(self.hub_port):
            free_port_on_windows(self.hub_port)
            time.sleep(0.25)

    def _ensure_core_services(
        self,
        *,
        include_simulator: bool = True,
        lsl_enabled: bool = True,
        session_prefix: str = "session",
        force_restart_hub: bool = False,
    ) -> None:
        if force_restart_hub and self.hub_server is not None:
            self._stop_hub_server()

        # 1) Hub (:8787)
        if self.hub_server is None:
            if is_port_in_use(self.hub_port):
                self.log(f"Liberando porta {self.hub_port} de processo anterior...")
                free_port_on_windows(self.hub_port)
                time.sleep(0.3)

            new_session_id = f"{session_prefix}-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}"

            def _run_hub() -> None:
                import uvicorn
                from biofeedback_hub.config import load_config
                from biofeedback_hub.main import create_app

                os.environ["BIOFEEDBACK_HUB_HOST"] = "0.0.0.0"
                os.environ["BIOFEEDBACK_HUB_PORT"] = str(self.hub_port)
                os.environ["BIOFEEDBACK_HUB_LOG_DIR"] = str(self.sessions_dir)
                os.environ["BIOFEEDBACK_SESSION_ID"] = new_session_id
                os.environ["BIOFEEDBACK_INCLUDE_SIMULATOR"] = "1" if include_simulator else "0"
                os.environ["BIOFEEDBACK_LSL_ENABLED"] = "1" if lsl_enabled else "0"
                cfg = load_config()
                app = create_app(cfg)
                uv_cfg = uvicorn.Config(app, host="0.0.0.0", port=self.hub_port, log_level="info", log_config=None)
                server = uvicorn.Server(uv_cfg)
                self.hub_server = server
                mode_label = "DEMO" if include_simulator else "REAL"
                self.log(f"[hub] Biofeedback Hub ({mode_label}) ativo em http://127.0.0.1:{self.hub_port} (sessão: {cfg.session_id})")
                asyncio.run(server.serve())

            threading.Thread(target=_run_hub, daemon=True).start()

        # 2) Dashboard (:5173)
        if self.dashboard_server is None:
            if is_port_in_use(self.dashboard_port):
                self.log(f"Liberando porta {self.dashboard_port} de processo anterior...")
                free_port_on_windows(self.dashboard_port)
                time.sleep(0.3)

            dist_dir = resolve_dashboard_dist()
            handler = partial(SpaRequestHandler, directory=str(dist_dir))
            server = ThreadingHTTPServer(("127.0.0.1", self.dashboard_port), handler)
            self.dashboard_server = server
            self.log(f"[dashboard] Dashboard pronto em http://127.0.0.1:{self.dashboard_port}")
            threading.Thread(target=server.serve_forever, daemon=True).start()

    def stop_sensors(self) -> None:
        loop = self.sensor_loop
        thread = self.sensor_thread
        self.sensor_loop = None
        self.sensor_thread = None
        self.active_sensor_mode = "Inativo"
        if loop is not None and loop.is_running():
            def _cancel_all() -> None:
                for task in asyncio.all_tasks(loop):
                    task.cancel()
            try:
                loop.call_soon_threadsafe(_cancel_all)
            except Exception:
                pass
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=1.5)
        self.log("Sensores encerrados.")

    def start_demo_stack(self, open_browser: bool = False) -> None:
        def _task() -> None:
            self.stop_sensors()
            need_restart = self.is_real_mode
            self.is_real_mode = False
            self._ensure_core_services(
                include_simulator=True,
                lsl_enabled=True,
                session_prefix="session-demo",
                force_restart_hub=need_restart,
            )

            for _ in range(30):
                if fetch_hub_health(self.hub_port) is not None:
                    break
                time.sleep(0.2)

            self.active_sensor_mode = "Simulador HRV+ECG"

            def _sensor_thread() -> None:
                from biofeedback_hub.tools.sim_client import run_client

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                self.sensor_loop = loop
                ws_url = f"ws://127.0.0.1:{self.hub_port}/ws"

                self.log(f"[sim] Conectado ao Hub ({self.active_sensor_mode}) -> enviando hrv.raw + ECG sintético")
                try:
                    loop.run_until_complete(run_client(ws_url, "hrv-ecg", None))
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass
                finally:
                    loop.close()

            t = threading.Thread(target=_sensor_thread, daemon=True)
            self.sensor_thread = t
            t.start()

            if open_browser:
                time.sleep(0.4)
                self.open_dashboard_browser()

        threading.Thread(target=_task, daemon=True).start()

    def open_real_mode_dialog(self) -> None:
        tk = self.tk
        dlg = tk.Toplevel(self.root)
        dlg.title("Modo Real — Selecionar Sensores")
        dlg.configure(bg=TOKENS["surface"])
        dlg.resizable(False, False)
        dlg.transient(self.root)
        dlg.grab_set()

        frame = tk.Frame(dlg, bg=TOKENS["surface"], padx=20, pady=16)
        frame.pack(fill="both", expand=True)

        tk.Label(
            frame,
            text="Selecionar Sensores para Sessão Real",
            font=("Segoe UI", 11, "bold"),
            fg=TOKENS["text"],
            bg=TOKENS["surface"],
            anchor="w",
        ).pack(fill="x", pady=(0, 4))

        tk.Label(
            frame,
            text="Ao iniciar o Modo Real, a sessão demo é encerrada e uma nova sessão real é criada.",
            font=("Segoe UI", 9),
            fg=TOKENS["muted"],
            bg=TOKENS["surface"],
            anchor="w",
            wraplength=380,
            justify="left",
        ).pack(fill="x", pady=(0, 12))

        polar_var = tk.BooleanVar(value=True)
        lsl_var = tk.BooleanVar(value=True)

        tk.Checkbutton(
            frame,
            text="Polar H10 (ECG / HR / RR via Bluetooth BLE)",
            variable=polar_var,
            font=("Segoe UI", 9, "bold"),
            fg=TOKENS["text"],
            bg=TOKENS["surface"],
            activebackground=TOKENS["surface"],
            selectcolor=TOKENS["surface_high"],
            anchor="w",
        ).pack(fill="x", pady=4)

        tk.Checkbutton(
            frame,
            text="Descoberta LSL (Lab Streaming Layer — EEG / outros)",
            variable=lsl_var,
            font=("Segoe UI", 9, "bold"),
            fg=TOKENS["text"],
            bg=TOKENS["surface"],
            activebackground=TOKENS["surface"],
            selectcolor=TOKENS["surface_high"],
            anchor="w",
        ).pack(fill="x", pady=4)

        tk.Label(
            frame,
            text="Clientes WebSocket externos (ex.: Unreal Engine) também poderão se conectar normalmente em ws://127.0.0.1:8787/ws.",
            font=("Segoe UI", 8),
            fg=TOKENS["muted"],
            bg=TOKENS["surface"],
            anchor="w",
            wraplength=380,
            justify="left",
        ).pack(fill="x", pady=(10, 14))

        btn_row = tk.Frame(frame, bg=TOKENS["surface"])
        btn_row.pack(fill="x")

        def _confirm() -> None:
            use_polar = bool(polar_var.get())
            use_lsl = bool(lsl_var.get())
            dlg.destroy()
            self.start_real_stack(use_polar=use_polar, use_lsl=use_lsl)

        tk.Button(
            btn_row,
            text="Cancelar",
            font=("Segoe UI", 9),
            bg=TOKENS["surface_high"],
            fg=TOKENS["text"],
            relief="solid",
            bd=1,
            padx=12,
            pady=6,
            cursor="hand2",
            command=dlg.destroy,
        ).pack(side="right", padx=(8, 0))

        tk.Button(
            btn_row,
            text="Iniciar Sessão Real",
            font=("Segoe UI", 9, "bold"),
            bg=TOKENS["primary"],
            fg="#ffffff",
            activebackground=TOKENS["primary_strong"],
            activeforeground="#ffffff",
            relief="flat",
            bd=0,
            padx=14,
            pady=6,
            cursor="hand2",
            command=_confirm,
        ).pack(side="right")

        dlg.update_idletasks()
        x = self.root.winfo_rootx() + max(20, (self.root.winfo_width() - dlg.winfo_width()) // 2)
        y = self.root.winfo_rooty() + max(20, (self.root.winfo_height() - dlg.winfo_height()) // 2)
        dlg.geometry(f"+{x}+{y}")

    def start_polar_stack(self) -> None:
        self.start_real_stack(use_polar=True, use_lsl=True)

    def start_real_stack(self, *, use_polar: bool = True, use_lsl: bool = True) -> None:
        def _task() -> None:
            self.stop_sensors()
            self.is_real_mode = True
            self.log("[modo-real] Encerrando sessão demo e iniciando nova sessão real...")
            self._ensure_core_services(
                include_simulator=False,
                lsl_enabled=use_lsl,
                session_prefix="session-real",
                force_restart_hub=True,
            )

            for _ in range(40):
                if fetch_hub_health(self.hub_port) is not None:
                    break
                time.sleep(0.2)

            if not use_polar:
                self.active_sensor_mode = "LSL Real" if use_lsl else "Hub Real (WebSocket)"
                self.log(f"[modo-real] Sessão real pronta ({self.active_sensor_mode}).")
                return

            self.active_sensor_mode = "Polar H10 + LSL" if use_lsl else "Polar H10 Real"

            def _polar_thread() -> None:
                try:
                    from biofeedback_hub.tools.polarh10_client import async_main as bridge_main
                    polar_dir = resolve_polar_dir()
                    os.chdir(polar_dir)
                    if str(polar_dir) not in sys.path:
                        sys.path.insert(0, str(polar_dir))
                    import main as polar_main
                except Exception as exc:
                    self.active_sensor_mode = "Erro Polar"
                    self.log(f"[polar] ERRO ao carregar driver Polar H10: {exc}")
                    return

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                self.sensor_loop = loop

                async def _runner() -> None:
                    driver_task = asyncio.create_task(polar_main.main())
                    await asyncio.sleep(1.0)
                    bridge_task = asyncio.create_task(
                        bridge_main(
                            [
                                "--hub-ws",
                                f"ws://127.0.0.1:{self.hub_port}/ws",
                                "--polar-ws",
                                "ws://localhost:8765/stream",
                                "--polar-control-ws",
                                "ws://localhost:8765/control",
                            ]
                        )
                    )
                    await asyncio.gather(driver_task, bridge_task, return_exceptions=True)

                self.log("[polar] Iniciando Driver Polar H10 (:8765) + Ponte Polar -> Hub (:8787)...")
                try:
                    loop.run_until_complete(_runner())
                except asyncio.CancelledError:
                    pass
                except Exception as exc:
                    self.log(f"[polar] Aviso: {exc}")
                finally:
                    loop.close()

            t = threading.Thread(target=_polar_thread, daemon=True)
            self.sensor_thread = t
            t.start()

        threading.Thread(target=_task, daemon=True).start()

    # -----------------------------------------------------------------------
    # Ações da UI
    # -----------------------------------------------------------------------

    def open_dashboard_browser(self) -> None:
        url = f"http://127.0.0.1:{self.dashboard_port}/?v={int(time.time())}"
        webbrowser.open(url)

    def refresh_sessions_list(self) -> None:
        files = sorted(
            self.sessions_dir.glob("session-*.jsonl"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        session_ids = [f.stem for f in files]
        self.session_combo["values"] = session_ids
        if self.current_session_id != "—" and self.current_session_id in session_ids:
            self.export_session_var.set(self.current_session_id)
        elif session_ids and not self.export_session_var.get():
            self.export_session_var.set(session_ids[0])

    def export_session_gui(self) -> None:
        session_id = self.export_session_var.get().strip() or self.current_session_id
        if not session_id or session_id == "—":
            self.messagebox.showwarning("Exportar Sessão", "Nenhuma sessão selecionada.")
            return

        signal = self.export_signal_var.get()
        fmt = self.export_format_var.get()
        default_name = f"{session_id}_{signal}.{fmt}"

        out_path = self.filedialog.asksaveasfilename(
            title="Salvar arquivo exportado",
            initialdir=str(app_root_dir()),
            initialfile=default_name,
            defaultextension=f".{fmt}",
            filetypes=[(f"Arquivo {fmt.upper()}", f"*.{fmt}"), ("Todos os arquivos", "*.*")],
        )
        if not out_path:
            return

        try:
            run_worker_export(
                [
                    "--session",
                    session_id,
                    "--sessions-dir",
                    str(self.sessions_dir),
                    "--signal",
                    signal,
                    "--format",
                    fmt,
                    "--out",
                    out_path,
                ]
            )
            meta_path = Path(out_path).with_suffix(".meta.json")
            self.log(f"[export] Exportado com sucesso: {out_path} (+ {meta_path.name})")
            self.messagebox.showinfo(
                "Exportação Concluída",
                f"Arquivo exportado com sucesso!\n\nSinal: {signal.upper()}\nArquivo: {out_path}\nMetadados: {meta_path}",
            )
        except Exception as exc:
            self.log(f"[export] ERRO ao exportar: {exc}")
            self.messagebox.showerror("Erro na Exportação", str(exc))

    def _poll_status(self) -> None:
        def _check() -> None:
            health = fetch_hub_health(self.hub_port)
            dash_ok = is_port_in_use(self.dashboard_port)
            sensor_ok = self.sensor_loop is not None and self.sensor_loop.is_running()

            def _update_ui() -> None:
                if self.closing:
                    return
                if health and health.get("ok"):
                    sid = health.get("sessionId", "—")
                    self._set_cell_tone(self.hub_cell, self.hub_title_lbl, self.hub_val_lbl, "ok", "Online")
                    if sid != self.current_session_id:
                        self.current_session_id = sid
                        self._set_cell_tone(
                            self.session_cell, self.session_title_lbl, self.session_val_lbl, "neutral", sid
                        )
                        self.export_session_var.set(sid)
                        self.refresh_sessions_list()
                else:
                    self._set_cell_tone(self.hub_cell, self.hub_title_lbl, self.hub_val_lbl, "error", "Offline")

                if dash_ok:
                    self._set_cell_tone(self.dash_cell, self.dash_title_lbl, self.dash_val_lbl, "ok", "Online")
                else:
                    self._set_cell_tone(self.dash_cell, self.dash_title_lbl, self.dash_val_lbl, "error", "Offline")

                if sensor_ok:
                    self._set_cell_tone(
                        self.sensor_cell, self.sensor_title_lbl, self.sensor_val_lbl, "ok", self.active_sensor_mode
                    )
                else:
                    self._set_cell_tone(
                        self.sensor_cell, self.sensor_title_lbl, self.sensor_val_lbl, "warn", "Parado"
                    )

            self.root.after(0, _update_ui)

        threading.Thread(target=_check, daemon=True).start()
        if not self.closing:
            self.root.after(1500, self._poll_status)

    def on_close(self) -> None:
        self.closing = True
        self.stop_sensors()
        if self.dashboard_server is not None:
            try:
                self.dashboard_server.shutdown()
            except Exception:
                pass
        if self.hub_server is not None and hasattr(self.hub_server, "should_exit"):
            setattr(self.hub_server, "should_exit", True)
        self.root.destroy()
        os._exit(0)

    def run(self) -> None:
        self.root.mainloop()


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Biofeedback Hub: Executável Unificado")
    parser.add_argument(
        "--export",
        action="store_true",
        help="Executa apenas o exportador CLI (.npy/.mat).",
    )
    args, remaining = parser.parse_known_args()

    if args.export:
        run_worker_export(remaining)
    else:
        app = BiofeedbackLauncherApp()
        app.run()


if __name__ == "__main__":
    main()
