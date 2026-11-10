# Träningsappen – första versionen

## Filer
- `index.html` – appens struktur
- `style.css` – premiumdesign med grön accent
- `app.js` – funktioner, historik, övningar, planering och Firebase-koppling

## Testa lokalt
Öppna projektmappen i Visual Studio Code och starta `index.html` med exempelvis tillägget Live Server. Eftersom appen använder JavaScript-moduler fungerar det bäst via en lokal webbserver, inte genom att dubbelklicka på filen.

## Firebase
Appen har en lokal testlagring via `localStorage`. För synkning via Firebase:
1. Skapa ett Firebase-projekt.
2. Lägg till en webbapp och kopiera Firebase-konfigurationen.
3. Aktivera Authentication och Anonymous sign-in.
4. Skapa Firestore Database.
5. Ersätt platshållarna i `app.js` i objektet `firebaseConfig`.
6. Sätt upp Firestore Security Rules så att bara din autentiserade användare kan läsa och skriva sina uppgifter. Använd inte öppna regler i en riktig app.

## Viktigt om denna första version
Det här är en fungerande grund/prototyp för att börja testa flödena. Den innehåller navigering, planeringsmallar, övningsbibliotek, registrering av träningspass, kalenderhistorik, viktiga pass, anteckningar och grundläggande statistik.

Den fullständiga kravspecifikationen innehåller fler funktioner som behöver byggas vidare, bland annat:
- Fullständigt stöd för egna registreringsfält och alla registreringstyper.
- Riktig veckoplanering och periodplanering i kalender.
- Redigering av alla delar av gamla träningspass och övningsresultat.
- Mer avancerad statistik, grafer, personliga rekord och mål.
- Timer, intervalltimer och vilotimer om de ska ingå.
- Säker personlig inloggning och färdiga Firestore-regler.
- Offlinehantering, synkning och export/backup.

## Publicering
När appen är redo kan den publiceras via Firebase Hosting eller GitHub Pages. Firebase Hosting är lämpligt när appen använder Firebase-tjänster.
