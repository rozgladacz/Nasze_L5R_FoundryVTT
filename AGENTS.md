# AGENTS.md

## Cel projektu
To jest nasz fork Foundry VTT module for L5R, którego celem jest dodanie automatyzacji mechanicznych efektów i zasad.

## Zasady pracy
- Najpierw czytaj istniejący kod, potem edytuj.
- Dla zadań wieloetapowych najpierw przygotuj krótki plan.
- Dla zadań prostych wykonuj minimalny lokalny patch.
- Nie przebudowuj architektury bez potrzeby.
- Preferuj małe, odwracalne zmiany.

## Konwencje zmian
- Nie zmieniaj formatowania poza zakresem zadania.
- Nie wprowadzaj dodatkowych refaktorów przy okazji małej zmiany.
- Jeśli poprawiasz błąd, opisz przyczynę i zakres poprawki.
- **Duże usunięcia z monolitycznych plików (app.js, rosters.py, armies.py):** podziel na osobne commity per kategoria (np. stałe, funkcje kosztowe, helpery UI). Jeden commit nie powinien usuwać więcej niż ~150 linii z jednego pliku bez weryfikacji każdej usuwanej funkcji przez `grep`.

## Komentarze sekcji 
- Analizując plik — przeczytaj komentarze sekcji jako mapę, zanim zaczniesz przeszukiwać kod.
- Dodając nową funkcję — umieść ją w odpowiedniej sekcji; jeśli nie pasuje do żadnej, dodaj nowy nagłówek sekcji.
- Przenosząc lub usuwając funkcję wymienioną w nagłówku sekcji — zaktualizuj listę funkcji w komentarzu.
- Tworząc nowy plik z logiką (>100 linii) — dodaj komentarze sekcji od razu.
- Nie dodawaj komentarzy do krótkich plików pomocniczych (<50 linii) ani do szablonów HTML.


## Oczekiwany sposób pracy agenta
- Przed zmianą wskaż pliki, które zamierzasz edytować.
- Odczytuj pliki batchami
- Jeśli wymaganie jest niejasne, najpierw wypisz założenia i braki.
- Po wykonaniu zmian podaj:
  - co zmieniono
  - jak zweryfikowano
  - co nadal wymaga decyzji
