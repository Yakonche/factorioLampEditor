# Factorio Lamp Editor

[English](README.md)

Factorio Lamp Editor transforme du pixel art, des dessins, du texte, des images, des diaporamas, des GIF, des vidéos et des séquences approximatives de notes en chaînes de blueprint pour Factorio 2.x.

Ce dépôt est un fork étendu, orienté application de bureau, de [l’application web Factorio Lamp Editor d’origine](https://factorio-lamp-editor.vercel.app/) et de son [dépôt source](https://github.com/jojkos/factorioLampEditor). Il s’agit d’un projet communautaire indépendant, sans affiliation ni approbation de Wube Software.

> [!IMPORTANT]
> Décision concernant la licence : le dépôt d’origine ne publie aucune licence logicielle ; ce fork reste donc volontairement sans licence, sous le régime du copyright par défaut. Les liens ci-dessus assurent l’attribution de la source, mais n’accordent pas de droit de réutilisation open source. Consultez [LICENSE](LICENSE) et [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Fonctionnement général

L’éditeur représente chaque pixel visible par une lampe Factorio, puis construit les éléments du réseau logique nécessaires pour reproduire une image fixe ou une animation temporisée. La chaîne de blueprint générée peut être copiée et importée directement dans Factorio 2.x.

### Édition et mise en page

- Dessiner sur la grille, effacer des cellules, importer une image fixe ou réinitialiser complètement le canevas.
- Créer des tampons de texte avec une taille, une couleur et une police globales, des polices TTF/OTF importées et des emojis statiques. Une sélection peut être mise en gras, en italique ou soulignée, et le champ texte dispose d’un menu contextuel complet. Les véritables emojis animés sont créés depuis le catalogue officiel Noto séparé.
- Choisir entre des polices intégrées au rendu identique partout, l’inventaire complet des polices exposé par l’OS dans l’application de bureau et des fichiers TTF/OTF importés. Les polices importées utilisent leur nom complet OpenType interne plutôt que leur nom de fichier. Chaque source reste divisée entre polices à chasse fixe et proportionnelles, chaque entrée prévisualise sa propre police et affiche une estimation raster conservatrice sans perte perceptible sous la forme `(X px)`.
- Rechercher et filtrer le catalogue complet des emojis Unicode RGI statiques, avec les variantes de couleur de peau prises en charge. Choisir Apple ou Segoe natifs, Noto Color Emoji ou Toss Face intégrés, ou les illustrations téléchargeables Twemoji 17, OpenMoji 17, Blobmoji et Microsoft Fluent Flat, Color ou 3D.
- Parcourir les 881 véritables animations du catalogue officiel Google Noto Animated Emoji. Les aperçus visibles utilisent les animations réelles ; en sélectionner une télécharge à la demande la ressource sous licence CC BY 4.0 et convertit ses vraies images en tampon Factorio plaçable à la taille globale choisie. Les anciennes séquences de glyphes créées par l’éditeur ont été retirées ; Twemoji ne fournit aucun catalogue animé officiel.
- Limiter une zone de texte horizontalement ou verticalement et la faire défiler de droite à gauche, de gauche à droite, de haut en bas ou de bas en haut, avec une bordure vide d’une case.
- Basculer toute l’interface entre le français et l’anglais grâce aux boutons drapeaux ; les noms des items Factorio restent en anglais.
- Définir une zone d’affichage pour un texte. Un texte trop large défile automatiquement et conserve une marge vide d’une cellule.
- Redimensionner la barre d’outils en faisant glisser son bord droit ; un double-clic sur la poignée restaure la largeur par défaut.
- Ajouter de la brique, du béton, du béton de danger, du béton raffiné ou du béton de danger raffiné une case entière au-delà des lampes.
- Placer les combinateurs d’animation au-dessus, en dessous, à gauche ou à droite. Le placement au-dessus est utilisé par défaut.
- Le placement automatique des poles est activé par défaut. L’écran facultatif d’aide et de durée dans le jeu est désactivé par défaut.

### Images et animations

- Importer plusieurs images pour créer un diaporama. Les frames sont affichées dans un bandeau dédié en bas, et non dans la barre latérale.
- Modifier en une fois la durée de toutes les frames, puis surcharger chaque durée individuellement ; la valeur globale peut de nouveau écraser toutes les durées.
- Importer les GIF, APNG, WebP statiques ou animés, WebM transparents, vidéos ordinaires lisibles par FFmpeg et animations Telegram TGS/Lottie. Les durées GIF anciennes ou non standard sont réparées lorsque c’est possible.
- Importer les formats vidéo lisibles par FFmpeg dans l’application de bureau.
- Redimensionner les médias animés en conservant leurs proportions et leur transparence. Si la définition choisie ou la limite Factorio de 30 FPS impose une conversion, l’application affiche les valeurs avant/après et demande d’abord confirmation.
- Régler les FPS, la limite de frames, les dimensions, le mode couleur, le monochrome et le filtrage des faibles variations de couleur.
- Examiner et retirer manuellement des frames lorsque la limite est dépassée, ou appliquer une sélection automatique uniforme.
- Lier une piste audio à un GIF ou une vidéo afin qu’ils utilisent le même compteur à 60 ticks par seconde et démarrent ensemble.
- Lire directement sur le canevas les textes défilants, emoji animés, diaporamas, GIF et vidéos avec leurs durées exactes par frame dans Factorio. L’aperçu peut être mis en pause et parcouru image par image.
- Suivre la génération d’une blueprint longue avec un pourcentage réel d’avancement.
- Copier directement les blueprints ordinaires. Pour les exports exceptionnellement grands comme Bad Apple en fidélité complète, l’application évite une relecture coûteuse du presse-papiers et propose **Enregistrer la blueprint** comme solution de secours, sans nouvelle génération.

### Réduction de la taille des blueprints

- Les pixels qui ne changent jamais deviennent des lampes ordinaires toujours allumées.
- Les frames identiques sont fusionnées.
- Les données d’animation ne stockent que les changements de pixels.
- Les transitions vides ne génèrent pas de decider combinator inutile.
- Lorsque c’est possible, les événements des deux speakers sont regroupés pour un même instant échantillonné.

Une animation longue conservant sa définition et ses FPS peut malgré tout produire une blueprint gigantesque. La génération est exécutée hors du thread de l’interface, qui reste donc utilisable et indique la progression réelle pendant la création des entités, la sérialisation JSON, la compression et l’encodage Base64.

Les empreintes cyan affichées autour d’une animation constituent l’aperçu de son infrastructure de blueprint. Elles représentent les combinators, substations du contrôleur, relais du circuit, speakers et l’écran facultatif qui seront inclus dans la nouvelle blueprint. Jusqu’à 100 000 empreintes de contrôleur/audio peuvent être échantillonnées ; un index spatial ne dessine que celles présentes dans la zone visible. Si Windows refuse un transfert très volumineux vers le presse-papiers, l’ancien contenu est effacé et la même chaîne générée peut immédiatement être enregistrée dans un fichier texte.

## Capacités navigateur et application de bureau

| Fonction | Version navigateur de développement | Application Windows/Linux |
| --- | :---: | :---: |
| Dessin, texte, polices, emojis, images fixes | Oui | Oui |
| Diaporamas multi-images | Oui | Oui |
| Décodage GIF, vidéo et audio | Non | Oui |
| Exécutable portable | Non | Oui |

L’application de bureau embarque FFmpeg pour décoder les médias localement. Aucun service d’envoi en ligne n’est nécessaire.

## Utilisation

1. Lancez l’exécutable Windows portable, l’AppImage Linux ou le serveur de développement.
2. Dessinez sur la grille, utilisez **Stamps** ou importez un ou plusieurs médias.
3. Pour une animation, vérifiez les dimensions, les FPS, la sélection des frames, le mode couleur et les durées.
4. Vous pouvez lier un fichier audio. L’éditeur convertit ses hauteurs dominantes en notes de speakers natifs, mais ne conserve pas la forme d’onde originale.
5. Configurez le sol, l’alimentation, les roboports, l’aide intégrée et la position du contrôleur.
6. Cliquez sur **Generate blueprint**, attendez 100 %, puis copiez la chaîne obtenue.
7. Dans Factorio, ouvrez l’importation de blueprint, collez la chaîne et confirmez.

### Cache des emojis

Les illustrations Twemoji, OpenMoji, Blobmoji et Microsoft Fluent téléchargées, ainsi que les animations Google Noto sélectionnées, sont enregistrées dans le dossier `emoji-cache` du répertoire persistant de données utilisateur d’Electron. Une ressource déjà utilisée peut ensuite être rechargée sans connexion Internet. Noto Color Emoji et Toss Face sont intégrés et ne nécessitent aucun premier téléchargement. La version navigateur de développement utilise l’API Cache Storage du navigateur pour le même usage. Le cache peut être supprimé sans danger ; les ressources manquantes seront de nouveau téléchargées lors de leur prochaine utilisation.

### Paramètre de variation de couleur

**Ignore color delta <= N** ignore les faibles variations RVB entre deux frames consécutives. À `0`, chaque changement détecté est conservé. Une valeur plus élevée considère des couleurs très proches comme identiques, ce qui peut éliminer le bruit de compression et réduire le nombre d’instructions d’animation et de combinateurs. Une valeur excessive peut supprimer des nuances ou des mouvements subtils. Une source monochrome a généralement besoin de peu ou pas de filtrage.

### Limites de l’audio

Une blueprint Factorio vanilla ne peut contenir ni MP3, ni forme d’onde stéréo, ni audio échantillonné arbitraire. L’application analyse donc chaque canal et approxime sa hauteur dominante avec les instruments natifs des programmable speakers. Une source stéréo peut produire deux speakers et deux suites de notes différentes, mais pas les deux formes d’onde d’origine.

L’échantillonnage accepte de 1 à 60 notes par seconde, Factorio fonctionnant à 60 ticks par seconde. Un débit élevé améliore le détail temporel, mais augmente très vite la taille de la blueprint ; 4 à 8 notes par seconde constituent un bon point de départ. Le mode **Auto** choisit la plage d’un instrument natif qui écrête le moins de notes détectées. Il reste possible d’imposer manuellement un instrument pour privilégier un timbre.

## Prérequis

- Node.js 22.12 ou plus récent
- npm
- Windows x64 pour l’exécutable portable Windows, ou Linux x64 pour l’AppImage
- Factorio 2.x pour importer la blueprint générée

## Développement

Installez exactement les versions enregistrées dans le lockfile :

```sh
npm ci
```

Lancez la version navigateur de développement :

```sh
npm run dev
```

Lancez l’application Electron depuis un build de production :

```sh
npm run desktop:dev
```

Contrôles ne nécessitant pas de média local :

```sh
npm run lint
npm run build
npm run test:ci
```

Des vérifications supplémentaires du décodeur utilisent des médias locaux placés dans le dossier ignoré `release/` :

```sh
npm run test:media-decoder
npm run test:morning
```

## Compiler l’application Windows portable

```sh
npm ci
npm run desktop:portable
```

Le résultat Windows est `release/Factorio Lamp Editor-1.6.0-win-x64-portable.exe`. Les dossiers `dist/`, `release/`, `release-build-*/` et `node_modules/` sont volontairement ignorés, car ils sont générés ou propres à une machine. Les médias de test, blueprints générées, applications Electron décompressées et exécutables portables ne doivent pas être commités ; publiez les exécutables dans les assets d’une GitHub Release.

## Compiler l’application Linux portable

Sous Linux x64 :

```sh
npm ci
npm run desktop:linux
```

Cette commande produit une AppImage et une archive portable `tar.gz`. Depuis Windows avec WSL2 Debian disponible, `wsl.exe -- bash scripts/build-linux-wsl.sh` effectue une compilation Linux isolée sans remplacer le dossier `node_modules` Windows. L’AppImage utilise le toolset statique épinglé `1.0.3` d’Electron Builder (runtime AppImage `20251108`) : les systèmes FUSE 3 actuels n’ont donc plus besoin de l’ancien paquet `libfuse.so.2`/`libfuse2`. Le montage demande toujours un périphérique `/dev/fuse` fonctionnel et `fusermount3` ; l’archive `tar.gz` reste l’alternative indépendante de FUSE.

## Organisation du projet

```text
electron/          Processus principal Electron, passerelle IPC et intégration FFmpeg
public/            Ressources statiques et icônes
scripts/           Scripts de validation des blueprints et médias
src/components/    Contrôles React, grille, panneaux et bandeaux de frames
src/utils/         Logique des blueprints, médias, audio, tampons et grille
src/workers/       Workers de génération et de traitement d’image
```

Vite compile le renderer React dans `dist/`. Electron charge ce renderer, expose une petite API contrôlée dans le preload et effectue les opérations de fichiers et de médias dans le processus principal. La génération de blueprint et les traitements d’image coûteux utilisent des Web Workers afin de ne pas bloquer l’interface.

Une description plus détaillée se trouve dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contribution et sécurité

Lisez [CONTRIBUTING.md](CONTRIBUTING.md) avant de proposer une modification. Signalez les vulnérabilités selon [SECURITY.md](SECURITY.md), sans publier immédiatement les détails permettant de les exploiter.

## Licence et marques

Ce fork ne possède volontairement aucune licence open source, puisque le projet d’origine n’en fournissait pas. Le copyright par défaut s’applique. Le fichier [LICENSE](LICENSE) consigne cette décision et l’attribution du projet d’origine ; les dépendances et ressources embarquées conservent leurs licences séparées, résumées dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Factorio est une marque de Wube Software Ltd. Ce projet communautaire n’est pas affilié à Wube Software.
