import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

SELECTORS = {
    "user": (
        ROOT / "user-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "supplier": (
        ROOT / "supplier-service/frontend/src/components/AppShell.module.css",
        ".workspaceSelectorOptions",
        ".actions .workspaceSelectorOptions button",
    ),
    "order": (
        ROOT / "order-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "credit": (
        ROOT / "credit-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "admin": (
        ROOT / "admin-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "notification": (
        ROOT / "notification-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
}

# The header bell (design.md "Shared application shell") is copied into every frontend. The copies
# must stay identical; Notification Service owns them.
BELL_SOURCES = ("NotificationBell.tsx", "useUnreadCount.ts", "NotificationBell.test.tsx")
BELL_FRONTENDS = ("user", "supplier", "order", "credit", "admin", "notification")
BELL_STYLES = {
    "user": (ROOT / "user-service/frontend/src/styles.css", ".notification-bell"),
    "supplier": (ROOT / "supplier-service/frontend/src/components/AppShell.module.css", ".notificationBell"),
    "order": (ROOT / "order-service/frontend/src/styles.css", ".notification-bell"),
    "credit": (ROOT / "credit-service/frontend/src/styles.css", ".notification-bell"),
    "admin": (ROOT / "admin-service/frontend/src/styles.css", ".notification-bell"),
    "notification": (ROOT / "notification-service/frontend/src/styles.css", ".notification-bell"),
}


def declarations(css, selector):
    match = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", css, re.DOTALL)
    if match is None:
        raise AssertionError(f"Missing CSS rule: {selector}")
    result = {}
    for declaration in match.group(1).split(";"):
        if ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        result[name.strip()] = " ".join(value.split())
    return result


class SharedRoleSelectorDesignTest(unittest.TestCase):
    def test_every_frontend_uses_the_same_role_selector_box_model(self):
        for service, (path, options_selector, button_selector) in SELECTORS.items():
            with self.subTest(service=service):
                css = path.read_text()
                options = declarations(css, options_selector)
                button = declarations(css, button_selector)

                self.assertEqual("inline-flex", options.get("display"))
                self.assertEqual("center", options.get("align-items"))
                self.assertEqual("0.1875rem", options.get("padding"))

                expected_button = {
                    "display": "inline-flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "appearance": "none",
                    "height": "2rem",
                    "min-height": "2rem",
                    "margin": "0",
                    "font-size": "0.78rem",
                    "font-weight": "600",
                    "line-height": "1",
                }
                for property_name, expected in expected_button.items():
                    self.assertEqual(
                        expected,
                        button.get(property_name),
                        f"{service} differs for {property_name}",
                    )


class SharedNotificationBellTest(unittest.TestCase):
    def test_every_frontend_has_the_same_bell(self):
        for source in BELL_SOURCES:
            reference = (ROOT / "notification-service/frontend/src/components" / source).read_text()
            for service in BELL_FRONTENDS:
                with self.subTest(service=service, source=source):
                    copy = ROOT / f"{service}-service/frontend/src/components" / source
                    self.assertEqual(reference, copy.read_text(), f"{service} {source} differs")

    def test_every_frontend_gives_the_bell_the_same_control_size(self):
        for service, (path, selector) in BELL_STYLES.items():
            with self.subTest(service=service):
                bell = declarations(path.read_text(), selector)
                self.assertEqual("2.75rem", bell.get("width"))
                self.assertEqual("2.75rem", bell.get("height"))


if __name__ == "__main__":
    unittest.main()
