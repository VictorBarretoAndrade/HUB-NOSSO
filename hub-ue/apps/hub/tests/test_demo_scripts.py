from __future__ import annotations

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]


class DemoScriptsTest(unittest.TestCase):
    def test_root_package_exposes_demo_commands(self) -> None:
        package_json = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertEqual(package_json["scripts"]["dev:demo"], "powershell -ExecutionPolicy Bypass -File tools/dev/start_hub_demo.ps1")
        self.assertEqual(
            package_json["scripts"]["dev:demo:stop"],
            "powershell -ExecutionPolicy Bypass -File tools/dev/stop_hub_demo.ps1",
        )

    def test_start_demo_script_has_expected_interface(self) -> None:
        script = (ROOT / "tools/dev/start_hub_demo.ps1").read_text(encoding="utf-8")

        for expected in [
            "[int]$HubPort = 8788",
            "[int]$DashboardPort = 5173",
            "[string]$HostAddress = \"127.0.0.1\"",
            "[switch]$NoClients",
            "[switch]$SkipLogger",
            "[switch]$SkipHrv",
            "if (-not $NoClients -and -not (Test-Path $SimExe))",
            "demo-processes.json",
            "biofeedback-sim.exe",
            "Add-PortOwnerProcesses",
            "Diagnostics endpoint = http://$HostAddress`:$HubPort",
        ]:
            self.assertIn(expected, script)

    def test_stop_demo_script_only_stops_registered_processes(self) -> None:
        script = (ROOT / "tools/dev/stop_hub_demo.ps1").read_text(encoding="utf-8")

        self.assertIn("demo-processes.json", script)
        self.assertIn("Stop-Process -Id $process.Pid", script)
        self.assertNotIn("Get-NetTCPConnection", script)
        self.assertNotIn("-LocalPort", script)


if __name__ == "__main__":
    unittest.main()
