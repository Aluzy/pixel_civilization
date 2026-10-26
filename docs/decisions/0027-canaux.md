# 0027 — Canaux : amener l'eau jusqu'aux maisons

- **Date** : 2026-10-26
- **Statut** : acceptée
- **Documents concernés** : `docs/design/02-monde.md`, `06-ia.md`, `08-interface.md`, `13-agriculture-cuisine.md`, `16-guerre-et-forteresses.md`, `11-feuille-de-route.md`, glossaire

## Contexte

Depuis le village (décision 0026), deux individus ne partagent plus une case. Les bords de l'eau proches du camp deviennent donc un goulet : on y fait la queue, on s'en éloigne, on y meurt de soif. La demande : rendre l'accès à l'eau plus démocratique, en laissant les individus creuser des canaux d'irrigation qui amènent l'eau jusqu'aux habitations.

## Décision

**Le canal** (`data/recipes.json`, `src/sim/colony/canal.js`) :

- C'est une construction d'une case (`kind: canal`), creusée à mains nues avec une pierre pour la tapisser.
  - Cette recette n'a qu'un seul ingrédient, la pierre, ce qui ne la confond avec aucune autre recette à mains nues.
- L'eau y coule dès qu'elle est creusée : chaque case se creuse à côté de l'eau ou du canal déjà creusé.
- On boit à côté d'un canal comme à côté d'un lac. Il compte comme de l'eau pour la mémoire, le tableau noir et la recherche des bords d'eau.
- On le traverse en pataugeant (vitesse ×0,5). Les prédateurs ne le traversent pas.
- Une parcelle à côté d'un canal est **arrosée d'elle-même** chaque jour : c'est l'irrigation.
  - Une case à 4 cases au plus d'un canal peut devenir une parcelle, comme près d'un lac.
- Un canal qui passe sous l'enceinte est une **porte d'eau** : le pan compte comme fermé.
- Rien ne se bâtit sur un canal, et il ne se retient pas comme un lieu à part : c'est de l'eau.

**Le projet de canal** (couche 4) :

- Une fois par jour, une colonie d'au moins 20 membres sans canal en cours cherche le foyer qui a le plus soif :
  - son camp, si l'eau est à plus de 6 cases ;
  - sinon la maison dont un lit est le plus loin de l'eau, au-delà de 6 cases.
- Elle trace le canal depuis une case libre près de ce foyer jusqu'à la case la plus proche qui touche l'eau (lac ou canal déjà creusé).
  - Le tracé est une recherche en largeur sur 4 voisins, dans 40 cases au plus.
  - Il passe par la terre praticable libre, les parcelles (abandonnées) et les pans de palissade.
  - Il ne dépasse pas 60 cases.
- Le chantier se mène comme celui d'un mur :
  - les membres apportent la pierre par lots de 10 cases ;
  - un bâtisseur qui connaît la recette creuse depuis une case voisine, en partant du bord de l'eau ;
  - si personne ne connaît la recette, un membre la cherche par l'essai.
- Si une construction barre la route en cours de chantier, le tracé est abandonné. Un autre sera tracé le lendemain.
- Le canal achevé est annoncé dans la chronique : « creuse un canal qui amène l'eau jusqu'aux maisons ».

## Conséquences

- À 10 membres, les canaux détournaient trop tôt les bras de la croissance (la sortie du J5 ne tenait plus) : d'où 20.
- Les canaux suivent les allées du village et se ramifient d'une maison à l'autre, du canal existant vers la suivante.
- Mesures (10 graines, 150 jours) : voir la feuille de route ([11](../design/11-feuille-de-route.md), « Le village »).
- Valeurs de `data/balance.json` : nouvelle section `canal` (`minMembers` 20, `reach` 6, `maxLength` 60, `batch` 10).
- Reporté :
  - écluses et débit (aujourd'hui l'eau est partout la même) ;
  - ponts ;
  - puits ;
  - canaux qui assèchent un lac.
