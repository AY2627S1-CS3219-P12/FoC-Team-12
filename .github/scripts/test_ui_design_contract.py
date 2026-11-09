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


HEADER_ACTIONS = re.compile(r"(?:^|\s|,)\.(?:header-actions|profile-app-actions|actions)\s*>?\s*a(?![\w-])")


def header_action_selectors(css):
    """Selectors that style a link (or its icon) in the header's account/actions area."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    found = []
    for match in re.finditer(r"([^{}]+)\{[^{}]*\}", css):
        for selector in match.group(1).split(","):
            selector = " ".join(selector.split())
            if HEADER_ACTIONS.search(selector) and not selector.endswith((":hover", ":focus-visible")):
                found.append(selector)
    return found


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


# design.md "Type, spacing and shape": DM Sans with the packaged Public Sans and system fallbacks.
# Each frontend sets it once on its root rule; without it the browser falls back to serif.
ROOT_FONTS = {
    "user": (ROOT / "user-service/frontend/src/styles.css", ":root"),
    "supplier": (ROOT / "supplier-service/frontend/src/styles/global.css", "html"),
    "order": (ROOT / "order-service/frontend/src/styles.css", ":root"),
    "credit": (ROOT / "credit-service/frontend/src/styles.css", ":root"),
    "admin": (ROOT / "admin-service/frontend/src/styles.css", ":root"),
    "notification": (ROOT / "notification-service/frontend/src/styles.css", ":root"),
}


class SharedTypefaceTest(unittest.TestCase):
    def test_every_frontend_sets_shared_interface_type_on_its_root(self):
        for service, (path, selector) in ROOT_FONTS.items():
            with self.subTest(service=service):
                root = declarations(path.read_text(), selector)
                self.assertEqual(
                    "'DM Sans', 'Public Sans', system-ui, sans-serif",
                    root.get("font-family", "").replace('"', "'"),
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

    def test_every_frontend_gives_the_bell_icon_the_same_size(self):
        for service, (path, selector) in BELL_STYLES.items():
            with self.subTest(service=service):
                css = path.read_text()
                icon = declarations(css, selector + " svg")
                self.assertEqual("1.25rem", icon.get("width"))
                self.assertEqual("1.25rem", icon.get("height"))
                self.assertEqual("inline-grid", declarations(css, selector).get("display"))
                # Header-action rules for nav-sized icons must exclude the bell, or its icon and
                # layout differ between frontends (the Errands bell rendered at 1rem, Home at 1.25rem).
                for rule_selector in header_action_selectors(css):
                    self.assertIn(
                        f":not({selector})",
                        rule_selector,
                        f"{service} rule '{rule_selector}' also styles the bell",
                    )


if __name__ == "__main__":
    unittest.main()
