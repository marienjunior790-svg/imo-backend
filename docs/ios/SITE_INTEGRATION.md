# Site ITC — plateformes (contrat réel)

Le site **ne doit pas** afficher « Disponible sur iOS » / bouton App Store tant que l’API dit le contraire.

## Endpoint

`GET https://imo-backend-production-d2d1.up.railway.app/api/v1/public/platforms`

Champs utiles :

- `ios.released` — **false** aujourd’hui
- `ios.showAppStoreCta` — **false**
- `platforms[]` où `id === 'ios'` : `storeUrl === null`, `version === null`
- `android.released` — true (sideload)
- `android.showPlayStoreCta` — false (APK debug, pas Play)

## Rendu attendu (état actuel)

```
ITC
Votre patrimoine. Votre intelligence.

ANDROID
Version 1.0.39
Disponible          → sideload / canal interne (PAS « sur Google Play »)
[Télécharger]       → seulement si vous hébergez un APK **signé release**
                      Sinon : ne pas mettre un faux lien Play Store.

IOS
Version —           → ne pas inventer 1.0.0
(pas de badge « Disponible sur l’App Store »)
(pas de bouton [App Store])
Texte possible : « iOS — bientôt, même compte ITC »

WEB
API 0.8.0
Lien app web seulement si PUBLIC_APP_URL pointe vers un front réel.
```

## Pseudo-code

```ts
const { data } = await fetch('/api/v1/public/platforms').then(r => r.json());
const ios = data.platforms.find(p => p.id === 'ios');

if (data.ios.showAppStoreCta && ios.storeUrl) {
  // bouton App Store
} else {
  // aucun CTA store iOS
}
```

## Quand une vraie release iOS existe

1. Binaire TestFlight ou App Store **réel**
2. Mettre à jour `src/modules/public/platform-catalog.ts`
3. Déployer l’API
4. Le site suit l’API — pas un flag figé dans le HTML
