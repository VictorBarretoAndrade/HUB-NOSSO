import unittest

from biofeedback_hub.auth import TokenAuthenticator


class TokenAuthenticatorTest(unittest.TestCase):
    def test_accepts_matching_global_token(self) -> None:
        auth = TokenAuthenticator(global_token="local-secret", client_tokens={})

        self.assertTrue(auth.is_allowed(client_id="unreal-quest", token="local-secret"))

    def test_accepts_client_specific_token(self) -> None:
        auth = TokenAuthenticator(global_token=None, client_tokens={"hrv-sim": "strap-secret"})

        self.assertTrue(auth.is_allowed(client_id="hrv-sim", token="strap-secret"))

    def test_rejects_missing_or_wrong_token_when_configured(self) -> None:
        auth = TokenAuthenticator(global_token="local-secret", client_tokens={})

        self.assertFalse(auth.is_allowed(client_id="unreal-quest", token=None))
        self.assertFalse(auth.is_allowed(client_id="unreal-quest", token="wrong"))


if __name__ == "__main__":
    unittest.main()
