# Stripe-Integration – offene Punkte

Stripe Checkout (von Stripe gehostete Bezahlseite, Weiterleitung) war schon für den Tamagotchi-Tier-Kauf eingebaut. Der bestehende Aufruf wurde auf die Vorgaben aus dem Checkout Studio umgestellt. Es gibt keine neuen Routen und keine neuen Abhängigkeiten.

## Zu ersetzende Werte (Values to Replace)

**Keine Platzhalter.** `mode`, `success_url`, `cancel_url` und `line_items` hatten schon echte Werte und bleiben unverändert:

| Feld | Aktueller Wert | Hinweis |
|------|----------------|---------|
| mode | `payment` | Einmalzahlung. Für Abos später auf `subscription` umstellen (siehe „Nächste Schritte"). |
| success_url | `{APP_PUBLIC_URL}/?pet_checkout={CHECKOUT_SESSION_ID}#/tamagotchi` | Echt, bleibt so. |
| cancel_url | `{APP_PUBLIC_URL}/?pet_checkout=cancel#/tamagotchi` | Echt, bleibt so. |
| line_items | `price_data` mit Betrag aus der Tamagotchi-Verwaltung | Kein Price-Objekt im Dashboard nötig. Den Preis stellst du in der App ein. |

## Konfigurierte Parameter (Configured Parameters)

Diese Werte kommen aus dem Checkout Studio und sind bereits korrekt gesetzt.

**Datei:**
- [src/services/stripeService.js](src/services/stripeService.js) (Funktion `createCheckoutSession`)

| Parameter | Wert |
|-----------|------|
| ui_mode | `hosted_page` |
| billing_address_collection | `auto` |
| phone_number_collection | `{ enabled: false }` |
| automatic_tax | `{ enabled: false }` |
| allow_promotion_codes | `false` |
| submit_type | `auto` |
| integration_identifier | `hosted_mobile_app_0001` |
| origin_context | `mobile_app` |
| payment_method_collection | `always`. Wird **nicht** mitgeschickt, weil nur für `mode: subscription` gültig. |

Hinweise dazu:
- **API-Version:** Die App nutzt kein Stripe-SDK, sondern ruft die REST-API direkt auf. `hosted_page` und `integration_identifier` gibt es erst ab `2026-03-25.dahlia`. Deshalb ist die feste Version jetzt `2026-08-26.dahlia` (vorher `2024-06-20`).
- **`origin_context: mobile_app`** ist bei Stripe für Käufe aus einer nativen iOS-App gedacht. Es optimiert die Bezahlseite für mobile Browser. ARK Tribe Hub ist eine Website. Falls du das nicht willst, stell es im Checkout Studio auf Web um und lösche die Zeile in `stripeService.js`.
- **Bewusst behalten**, weil App-Logik und keine Studio-Einstellung: `client_reference_id`, `metadata` und `payment_intent_data` (daran erkennt der Webhook, welches Tier für wen freigeschaltet wird), außerdem `expires_at`, `locale` und `custom_text` (Hinweis zum Erlöschen des Widerrufsrechts bei digitalen Inhalten).

## Einrichtung

**1. Umgebungsvariablen auf Render** (Service → Environment):

| Variable | Wert |
|----------|------|
| `STRIPE_SECRET_KEY` | Eingeschränkter Schlüssel (`rk_…`). Er braucht nur **Checkout Sessions: Schreiben**. ✅ eingetragen |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` aus Schritt 2 |
| `APP_PUBLIC_URL` | `https://arktribehub.de` ✅ schon gesetzt |

Schlüssel gehören nur in Render, nie in Code, Chat oder GitHub. Ein Schlüssel, der irgendwo offen stand, wird in Stripe gelöscht und neu erstellt.

**2. Webhook in Stripe anlegen** (Dashboard → Entwickler → Webhooks → Endpunkt hinzufügen):
- URL: `https://arktribehub.de/api/stripe/webhook`
- Ereignisse: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
- Das Signing Secret (`whsec_…`) als `STRIPE_WEBHOOK_SECRET` bei Render eintragen

**3. Zahlarten** (Karte, PayPal, Klarna …) schaltest du im Stripe-Dashboard frei. Checkout zeigt sie dann automatisch an.

**4. Verkauf öffnen:** In der App unter Tamagotchi-Verwaltung Preise setzen und den Verkauf öffnen. Dort siehst du auch, ob Stripe und der Webhook erkannt werden.

## Geänderte Dateien

```
src/services/stripeService.js   API-Version + Checkout-Studio-Parameter
test/tamagotchi-shop.mjs        prüft die neuen Parameter und die API-Version
STRIPE_INTEGRATION_TODO.md      diese Datei
```

## Ablauf

1. Das Mitglied klickt „Kaufen" und stimmt der sofortigen Freischaltung zu. Das Frontend ruft `POST /api/pet/checkout` auf.
2. Der Server erstellt eine Checkout-Sitzung und merkt sie sich in `pet_purchases`. Der Browser wird zu Stripe weitergeleitet.
3. Nach der Zahlung meldet Stripe das per Webhook an `/api/stripe/webhook` (Signatur wird geprüft). Das Tier wird freigeschaltet.
4. Bei der Rückkehr (`?pet_checkout=cs_…`) prüft die App die Sitzung zusätzlich selbst bei Stripe. Beides ist idempotent, es wird also nichts doppelt gutgeschrieben.
5. Bei einer vollständigen Erstattung (`charge.refunded`) wird die Freischaltung zurückgenommen.

## Testen

Mit einem **Live-Schlüssel** wird echtes Geld abgebucht. Zum Testen einen Schlüssel aus dem Testmodus bzw. einer Sandbox nehmen (`rk_test_…` / `sk_test_…`), mit eigenem Test-Webhook und eigenem `whsec_…`.

| Karte | Ergebnis |
|-------|----------|
| `4242 4242 4242 4242` | Zahlung erfolgreich |
| `4000 0027 6000 3184` | Mit 3D-Secure-Abfrage |
| `4000 0000 0000 9995` | Abgelehnt (Guthaben nicht ausreichend) |

Beliebiges zukünftiges Ablaufdatum, beliebige CVC, beliebige PLZ.

## Nächste Schritte

- **Abos (später):** `mode: 'subscription'`, `payment_method_collection: 'always'` ergänzen, ein wiederkehrender Preis (Price-ID) und Webhook-Ereignisse für `customer.subscription.*` / `invoice.*`.
- **Steuern:** `automatic_tax` ist aus. Ob du Umsatzsteuer ausweisen musst (z. B. Kleinunternehmerregelung), mit Steuerberater bzw. Finanzamt klären.
- **Vor dem Live-Verkauf:** Impressum, Datenschutzerklärung (Stripe als Zahlungsdienstleister) und AGB/Widerrufsbelehrung prüfen.

## Ressourcen

- https://support.stripe.com
- https://docs.stripe.com/mcp
- https://docs.stripe.com/get-started/checklist/go-live
