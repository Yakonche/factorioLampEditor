/* eslint-disable react-refresh/only-export-components */
import React from 'react';

export type InterfaceLanguage = 'en' | 'fr';

const LANGUAGE_STORAGE_KEY = 'factorio-lamp-editor.interface-language';

const FRENCH_TRANSLATIONS: Record<string, string> = {
    'Switch interface to English': 'Afficher l’interface en anglais',
    'Switch interface to French': 'Afficher l’interface en français',
    'Interface language': 'Langue de l’interface',
    English: 'Anglais',
    'Real-time preview': 'Aperçu en temps réel',
    'Preview paused': 'Aperçu en pause',
    'Pause real-time preview': 'Mettre l’aperçu en temps réel en pause',
    'Play real-time preview': 'Lire l’aperçu en temps réel',
    Frame: 'Image',
    'ticks/s': 'ticks/s',
    shown: 'affichées',
    'spatially culled': 'filtrées selon la zone visible',
    'up to': 'jusqu’à',
    'sampled ROM/audio footprints': 'empreintes ROM/audio échantillonnées',
    French: 'Français',
    'Blueprint Generator': 'Générateur de blueprints',
    Reset: 'Réinitialiser',
    'Clear the entire grid and every imported frame': 'Effacer toute la grille et toutes les images importées',
    'Copy Blueprint': 'Copier la blueprint',
    'Click to Stamp': 'Cliquer pour placer',
    READY: 'PRÊT',
    Help: 'Aide',
    'Close help': 'Fermer l’aide',
    'Got it!': 'Compris !',
    Navigation: 'Navigation',
    'Pan canvas': 'Déplacer la zone de dessin',
    'Right-click drag': 'Clic droit + glisser',
    Zoom: 'Zoom',
    Scroll: 'Molette',
    'Pan tool': 'Outil de déplacement',
    'Brush, fill, erase, and pan use the B, F, E, and H shortcuts.': 'Le pinceau, le remplissage, l’effacement et le déplacement utilisent les raccourcis B, F, E et H.',
    'Imported images are centered automatically. Width and height can be edited while the link button controls proportions.': 'Les images importées sont centrées automatiquement. La largeur et la hauteur peuvent être modifiées tandis que le bouton de liaison contrôle les proportions.',
    'Text stamps support global size, font, and color settings, plus imported TTF/OTF fonts.': 'Les tampons de texte permettent de définir globalement la taille, la police et la couleur, ainsi que d’importer des polices TTF/OTF.',
    'The complete Unicode RGI emoji catalog is built in, including categories, search, skin tones, and an animation mode for every emoji. Limited display zones keep a one-cell border and become scrolling Factorio animations when needed.': 'Le catalogue Unicode RGI complet est intégré, avec catégories, recherche, couleurs de peau et un mode d’animation pour chaque emoji. Les zones d’affichage limitées conservent une bordure d’une case et deviennent des animations Factorio défilantes si nécessaire.',
    Press: 'Appuyez sur',
    'to create a text stamp, then click the grid to place it.': 'pour créer un tampon de texte, puis cliquez sur la grille pour le placer.',
    'The mouse wheel zooms the canvas;': 'La molette zoome dans la zone de dessin ;',
    'resize text stamps.': 'redimensionnent les tampons de texte.',
    'Enable the slideshow and add any number of images. Only imported images become frames; no empty Canvas frame is inserted.': 'Activez le diaporama et ajoutez autant d’images que souhaité. Seules les images importées deviennent des images d’animation ; aucune image Canvas vide n’est ajoutée.',
    'Set every duration at once in the toolbar, then override individual frames in the horizontal tray below the canvas. Applying the global value again overwrites all overrides.': 'Définissez toutes les durées en une fois dans la barre d’outils, puis modifiez individuellement les images dans le bandeau horizontal sous la zone de dessin. Réappliquer la valeur globale remplace toutes les valeurs individuelles.',
    'Click a bottom-tray thumbnail to preview it. Added images stay centered on the current canvas.': 'Cliquez sur une miniature du bandeau inférieur pour l’afficher. Les images ajoutées restent centrées dans la zone de dessin actuelle.',
    'The controller can be placed on any side and defaults to above the artwork. Pole and roboport placement covers the union of every frame.': 'Le contrôleur peut être placé de n’importe quel côté et se trouve par défaut au-dessus de l’illustration. Le placement des poles et roboports couvre l’union de toutes les images.',
    'Pixels that never change use Always ON lamps and no animation combinator; only changing pixels are stored in delta ROMs.': 'Les pixels qui ne changent jamais utilisent des lamps Always ON sans combinator d’animation ; seuls les pixels changeants sont stockés dans les ROM différentielles.',
    'FFmpeg preserves the source ratio. Width or height can be edited after import and the other dimension follows automatically.': 'FFmpeg conserve les proportions d’origine. La largeur ou la hauteur peut être modifiée après l’importation et l’autre dimension s’adapte automatiquement.',
    'The FPS limit is capped at 30 FPS. Set definition, FPS, color mode, and frame limit directly for long clips such as Bad Apple.': 'La limite est plafonnée à 30 FPS. Réglez directement la définition, les FPS, le mode de couleur et la limite d’images pour les longues vidéos comme Bad Apple.',
    'Ignore color delta': 'Ignorer l’écart de couleur',
    'compares each RGB channel with the preceding frame. 0 preserves every change; higher values reuse the previous color for small variations, reducing flicker and decider ROMs while sacrificing subtle detail. Lit/unlit changes are never ignored.': 'compare chaque canal RVB à l’image précédente. 0 conserve tous les changements ; les valeurs supérieures réutilisent la couleur précédente pour les faibles variations, réduisant le scintillement et les ROM de deciders au prix de détails subtils. Les passages allumé/éteint ne sont jamais ignorés.',
    'Grayscale and monochrome thresholding also reduce noisy transitions. Sparse per-line ROM packing removes deciders for lines that do not change, without changing definition or FPS.': 'Les niveaux de gris et le seuillage monochrome réduisent également les transitions parasites. Le regroupement clairsemé des ROM par ligne supprime les deciders des lignes inchangées sans modifier la définition ni les FPS.',
    'Legacy multi-image GIFs with missing timing blocks are repaired before decoding.': 'Les anciens GIF multi-images dont les blocs de timing sont manquants sont réparés avant le décodage.',
    'If decoding exceeds the shared frame limit (256 by default), the bottom tray shows every frame. Select removals or let the app choose evenly spaced frames.': 'Si le décodage dépasse la limite d’images partagée (256 par défaut), le bandeau inférieur affiche toutes les images. Sélectionnez celles à supprimer ou laissez l’application choisir des images régulièrement espacées.',
    'Consecutive duplicates are merged. The blueprint stores a base image and ordered frame differences.': 'Les doublons consécutifs sont fusionnés. La blueprint stocke une image de base et les différences ordonnées entre les images.',
    'applies to static images, slideshows, GIFs, and videos.': 's’applique aux images statiques, diaporamas, GIF et vidéos.',
    'is shared by slideshows and media and can be raised for intentionally large blueprints.': 'est partagé par les diaporamas et les médias et peut être augmenté pour les blueprints volontairement très grandes.',
    'fills the artwork and extends one complete tile beyond every edge.': 'remplit l’illustration et s’étend d’une tile complète au-delà de chaque bord.',
    'Import MP3, WAV, FLAC, OGG, or another FFmpeg-readable audio file. The app detects one dominant pitch per left/right channel.': 'Importez un fichier MP3, WAV, FLAC, OGG ou tout autre audio lisible par FFmpeg. L’application détecte une hauteur dominante par canal gauche/droit.',
    'One decider stores both channel pitches for each sampled instant; two programmable speakers play the approximate sequences.': 'Un decider stocke les hauteurs des deux canaux pour chaque instant échantillonné ; deux programmable speakers jouent les séquences approximatives.',
    'The sampling rate accepts 1–60 notes/s because Factorio runs at 60 ticks/s. 4–8 is recommended; high values produce much larger, denser, and often less musical blueprints.': 'Le taux d’échantillonnage accepte 1 à 60 notes/s car Factorio fonctionne à 60 ticks/s. Une valeur de 4 à 8 est recommandée ; les valeurs élevées produisent des blueprints beaucoup plus grandes, denses et souvent moins musicales.',
    'Choose a native instrument independently for each speaker, or use Auto to minimize notes clipped outside its range. Piano has 48 notes (F3–E7); the other melodic instruments have 36-note ranges.': 'Choisissez indépendamment un instrument natif pour chaque speaker ou utilisez Auto afin de réduire les notes hors de sa plage. Le Piano comporte 48 notes (F3–E7) ; les autres instruments mélodiques disposent de plages de 36 notes.',
    'After importing an animation and audio, click': 'Après avoir importé une animation et un audio, cliquez sur',
    'Linked playback shares the same tick counter and starts at T = 0; the animation defines the combined loop. Audio-only blueprints use the complete audio duration.': 'La lecture liée partage le même compteur de ticks et commence à T = 0 ; l’animation définit la boucle combinée. Les blueprints audio seules utilisent la durée audio complète.',
    'The original waveforms cannot be embedded in a vanilla blueprint, so this is a musical approximation rather than faithful MP3 or stereo playback.': 'Les formes d’onde d’origine ne peuvent pas être intégrées dans une blueprint vanilla ; il s’agit donc d’une approximation musicale et non d’une lecture fidèle du MP3 ou de la stéréo.',
    Click: 'Cliquez sur',
    'to generate and copy a Factorio 2.x blueprint string. The status bar reports the real generation percentage, including serialization and compression. Auto-place poles provides power; roboports and auto-construction add build coverage and a connected logistic backbone.': 'pour générer et copier une chaîne de blueprint Factorio 2.x. La barre d’état affiche le véritable pourcentage de génération, y compris la sérialisation et la compression. Le placement automatique des poles fournit l’alimentation ; les roboports et la construction automatique ajoutent une couverture de construction et un réseau logistique connecté.',
    'Drawing Tools': 'Outils de dessin',
    'Choose Color': 'Choisir la couleur',
    Undo: 'Annuler',
    Redo: 'Rétablir',
    'Pan (H)': 'Déplacer (H)',
    'Brush (B)': 'Pinceau (B)',
    'Fill (F)': 'Remplir (F)',
    'Erase (E)': 'Effacer (E)',
    Stamps: 'Tampons',
    'Drawing and stamping': 'Dessin et tampons',
    'Import Image': 'Importer une image',
    'Imported Image': 'Image importée',
    'Image dimensions': 'Dimensions de l’image',
    'Original:': 'Original :',
    'Current size': 'Taille actuelle',
    'Lock proportions': 'Verrouiller les proportions',
    'Unlock proportions': 'Déverrouiller les proportions',
    'Proportions locked': 'Proportions verrouillées',
    'Proportions unlocked': 'Proportions déverrouillées',
    'Width (px)': 'Largeur (px)',
    'Height (px)': 'Hauteur (px)',
    'Image width in pixels': 'Largeur de l’image en pixels',
    'Image height in pixels': 'Hauteur de l’image en pixels',
    'Increase width by 1 pixel': 'Augmenter la largeur de 1 pixel',
    'Decrease width by 1 pixel': 'Réduire la largeur de 1 pixel',
    'Increase height by 1 pixel': 'Augmenter la hauteur de 1 pixel',
    'Decrease height by 1 pixel': 'Réduire la hauteur de 1 pixel',
    'Output settings': 'Paramètres de sortie',
    'Maximum definition': 'Définition maximale',
    'px / side': 'px / côté',
    'Maximum animation frames': 'Nombre maximal d’images d’animation',
    'Shared by slideshows, GIFs, and videos. Raise this value when you intentionally want a very large blueprint.': 'Valeur partagée par les diaporamas, GIF et vidéos. Augmentez-la si vous souhaitez volontairement générer une très grande blueprint.',
    'Blueprint background': 'Arrière-plan de la blueprint',
    'Fills the complete artwork rectangle with the selected Factorio tile in every mode.': 'Remplit tout le rectangle de l’illustration avec la tile Factorio sélectionnée, quel que soit le mode.',
    'GIF / video animation': 'Animation GIF / vidéo',
    Decoding: 'Décodage',
    Replace: 'Remplacer',
    Import: 'Importer',
    'FPS limit': 'Limite de FPS',
    'Media FPS limit': 'Limite de FPS du média',
    'Color mode': 'Mode de couleur',
    'Full color': 'Couleurs complètes',
    Grayscale: 'Niveaux de gris',
    'Monochrome / Bad Apple': 'Monochrome / Bad Apple',
    'White threshold': 'Seuil de blanc',
    'Ignore color delta ≤': 'Ignorer l’écart de couleur ≤',
    'Pixels at or above the white threshold become white; all others become black. Source dimensions and timing are preserved.': 'Les pixels dont la valeur atteint ou dépasse le seuil deviennent blancs ; tous les autres deviennent noirs. Les dimensions et le timing d’origine sont conservés.',
    'Ignore color delta compares consecutive frames per RGB channel. 0 keeps every change; a higher value reuses the previous color for tiny variations, reducing flicker and decider ROMs at the cost of subtle detail. Changes to or from an unlit pixel are always kept.': 'Ignorer l’écart de couleur compare deux images consécutives canal RVB par canal. 0 conserve chaque changement ; une valeur supérieure réutilise la couleur précédente pour les faibles variations, ce qui réduit le scintillement et les ROM de deciders au prix de détails subtils. Les passages vers ou depuis un pixel éteint sont toujours conservés.',
    'Remove GIF/video animation': 'Supprimer l’animation GIF/vidéo',
    'Legacy GIF repaired: missing per-frame timing blocks were reconstructed automatically.': 'GIF ancien réparé : les blocs de timing manquants ont été reconstruits automatiquement.',
    'Width (ratio locked)': 'Largeur (proportions verrouillées)',
    'Height (ratio locked)': 'Hauteur (proportions verrouillées)',
    'Frames:': 'Images :',
    'Samples:': 'Échantillons :',
    'Decoded:': 'Décodé :',
    'Loop:': 'Boucle :',
    'Preview frame': 'Aperçu de l’image',
    'Previous frame': 'Image précédente',
    'Next frame': 'Image suivante',
    'Controller position': 'Position du contrôleur',
    'Media controller position': 'Position du contrôleur du média',
    Left: 'Gauche',
    Top: 'Haut',
    Right: 'Droite',
    Bottom: 'Bas',
    'Add an in-game display with frame count, loop duration, and timer value.': 'Ajouter un écran en jeu indiquant le nombre d’images, la durée de la boucle et la valeur du minuteur.',
    'Consecutive duplicate frames share their duration. The blueprint stores one base image plus ordered per-frame differences in line memories.': 'Les images consécutives identiques partagent leur durée. La blueprint stocke une image de base puis les différences ordonnées de chaque image dans des mémoires par ligne.',
    'Audio / programmable speakers': 'Audio / programmable speakers',
    Analyzing: 'Analyse',
    'Import audio': 'Importer un audio',
    'Notes / sec': 'Notes / s',
    'Audio notes per second': 'Notes audio par seconde',
    'Remove audio track': 'Supprimer la piste audio',
    Events: 'Événements',
    Speakers: 'Speakers',
    'Left notes:': 'Notes à gauche :',
    'Right notes:': 'Notes à droite :',
    'Left speaker': 'Speaker gauche',
    'Right speaker': 'Speaker droit',
    'Auto (best range)': 'Auto (meilleure plage)',
    'Audio linked to animation': 'Audio lié à l’animation',
    'Link audio to animation': 'Lier l’audio à l’animation',
    'Unlink the speakers from this animation': 'Dissocier les speakers de cette animation',
    'Start the speakers and animation on the same tick counter': 'Démarrer les speakers et l’animation sur le même compteur de ticks',
    'The audio becomes silent if it ends before the animation loop.': 'L’audio devient silencieux s’il se termine avant la boucle de l’animation.',
    'The slideshow and both speakers start together and share the same loop counter.': 'Le diaporama et les deux speakers démarrent ensemble et partagent le même compteur de boucle.',
    'This audio is not included in the animation blueprint yet. Use the link button above to synchronize and include both speakers.': 'Cet audio n’est pas encore inclus dans la blueprint d’animation. Utilisez le bouton ci-dessus pour synchroniser et inclure les deux speakers.',
    'With no animation, the complete audio duration defines the speaker loop.': 'Sans animation, la durée audio complète définit la boucle des speakers.',
    'Multi-image slideshow': 'Diaporama multi-images',
    'Cycle through any number of images': 'Faire défiler un nombre quelconque d’images',
    'Add one or more images': 'Ajouter une ou plusieurs images',
    'Frames are edited in the dedicated tray below the canvas.': 'Les images sont modifiées dans le bandeau dédié sous la zone de dessin.',
    'Set every frame duration': 'Définir la durée de toutes les images',
    seconds: 'secondes',
    Seconds: 'Secondes',
    'Apply this duration to all frames': 'Appliquer cette durée à toutes les images',
    'This deliberately overwrites every individual duration. You can then fine-tune each frame in the bottom tray.': 'Cette action remplace volontairement toutes les durées individuelles. Vous pouvez ensuite ajuster chaque image dans le bandeau inférieur.',
    'Add an in-game help display beside the generated slideshow timer.': 'Ajouter un écran d’aide en jeu à côté du minuteur du diaporama.',
    'Imported images are the actual slideshow frames. No empty “Canvas” frame is inserted. Pole and roboport placement uses the union of every frame.': 'Les images importées sont les véritables images du diaporama. Aucune image « Canvas » vide n’est ajoutée. Le placement des poles et roboports utilise l’union de toutes les images.',
    'Pixels that never change are exported as regular Always ON lamps and consume no animation ROM, memory, or decider combinator.': 'Les pixels qui ne changent jamais sont exportés comme des lamps Always ON normales et ne consomment aucune ROM d’animation, mémoire ou decider combinator.',
    'Slideshow frames': 'Images du diaporama',
    'Click a thumbnail to preview · individual values override the global duration': 'Cliquez sur une miniature pour l’afficher · les valeurs individuelles remplacent la durée globale',
    source: 'source',
    'Power Support': 'Alimentation électrique',
    'Auto-place Poles': 'Placer automatiquement les poles',
    'Auto-place Roboports': 'Placer automatiquement les roboports',
    'Auto construction': 'Construction automatique',
    'Builds one connected logistic and electric backbone so robots can expand the blueprint from a single edge connection.': 'Construit un réseau logistique et électrique connecté afin que les robots puissent déployer la blueprint à partir d’une seule connexion en bordure.',
    'Requires auto-placed poles for power.': 'Nécessite le placement automatique des poles pour l’alimentation.',
    Grid: 'Grille',
    Smart: 'Intelligent',
    'Experimental Feature': 'Fonction expérimentale',
    'Optimizes pole placement to avoid covering lamps.': 'Optimise le placement des poles pour éviter de recouvrir les lamps.',
    'May be slow on large canvases.': 'Peut être lent sur les grandes zones de dessin.',
    Statistics: 'Statistiques',
    'Lamps:': 'Lamps :',
    'Lamp power:': 'Puissance des lamps :',
    'Combinators:': 'Combinators :',
    'Combinator power:': 'Puissance des combinators :',
    'Decider and arithmetic combinators': 'Decider et arithmetic combinators',
    'Display panels:': 'Display panels :',
    'Speakers:': 'Speakers :',
    'Roboports:': 'Roboports :',
    'Roboport drain:': 'Consommation des roboports :',
    'Total power:': 'Puissance totale :',
    'Poles:': 'Poles :',
    'Resize sidebar': 'Redimensionner la barre latérale',
    'Drag to resize the sidebar · double-click to reset': 'Faire glisser pour redimensionner la barre latérale · double-cliquer pour réinitialiser',
    'Image exceeds canvas limit': 'L’image dépasse la limite de la zone de dessin',
    'This image is': 'Cette image mesure',
    'px. The maximum supported canvas size is': 'px. La taille maximale prise en charge est',
    'You can reduce it to': 'Vous pouvez la réduire à',
    'px while preserving its original aspect ratio. No cropping will be applied.': 'px tout en conservant ses proportions d’origine. Aucun recadrage ne sera appliqué.',
    'Cancel import': 'Annuler l’importation',
    'Reduce to': 'Réduire à',
    'Frame limit exceeded': 'Limite d’images dépassée',
    'Keep at most': 'Conservez au maximum',
    'frames. Check frames to remove': 'images. Cochez les images à supprimer',
    selected: 'sélectionnées',
    required: 'requises',
    kept: 'conservées',
    'Let the app decide': 'Laisser l’application décider',
    'Cancel': 'Annuler',
    'Text\n日本語も対応': 'Texte\n日本語も対応',
    Create: 'Créer',
    'Create text stamp (Ctrl+Enter)': 'Créer le tampon de texte (Ctrl+Entrée)',
    'GLOBAL SIZE': 'TAILLE GLOBALE',
    'GLOBAL FONT': 'POLICE GLOBALE',
    COLOR: 'COULEUR',
    'Import .ttf / .otf': 'Importer un fichier .ttf / .otf',
    Size: 'Taille',
    Font: 'Police',
    Color: 'Couleur',
    'Reset this character': 'Réinitialiser ce caractère',
    'Native emoji library': 'Bibliothèque d’emojis natifs',
    'Animated emoji library': 'Bibliothèque d’emojis animés',
    'Search emoji by name or symbol': 'Rechercher un emoji par nom ou symbole',
    'Emoji category': 'Catégorie d’emoji',
    'Emoji skin tone': 'Couleur de peau de l’emoji',
    'All categories': 'Toutes les catégories',
    'All skin tones': 'Toutes les couleurs de peau',
    'Default skin tone': 'Couleur de peau par défaut',
    'Light skin tone': 'Peau claire',
    'Medium-light skin tone': 'Peau moyennement claire',
    'Medium skin tone': 'Peau moyenne',
    'Medium-dark skin tone': 'Peau moyennement foncée',
    'Dark skin tone': 'Peau foncée',
    'Animation effect': 'Effet d’animation',
    Blink: 'Clignotement',
    Twinkle: 'Scintillement',
    Pulse: 'Pulsation',
    Clock: 'Horloge',
    Weather: 'Météo',
    Flower: 'Fleur',
    Earth: 'Terre',
    'Traffic light': 'Feu de circulation',
    Battery: 'Batterie',
    Celebration: 'Fête',
    Faces: 'Visages',
    Cats: 'Chats',
    Hearts: 'Cœurs',
    Dice: 'Dé',
    'Show more emoji': 'Afficher plus d’emojis',
    'No emoji matches this search.': 'Aucun emoji ne correspond à cette recherche.',
    'Every Unicode RGI emoji is available here. Skin-tone variants are generated when the selected emoji supports them.': 'Tous les emojis Unicode RGI sont disponibles ici. Les variantes de couleur de peau sont générées lorsque l’emoji sélectionné les prend en charge.',
    'Curated presets are text-glyph sequences made by the editor. The official catalog below contains only emoji with real published animation frames.': 'Les presets sélectionnés sont des séquences de glyphes créées par l’éditeur. Le catalogue officiel ci-dessous ne contient que des emojis possédant de véritables images d’animation publiées.',
    'Curated animated presets': 'Animations prédéfinies',
    'Official Noto Animated Emoji': 'Emojis animés Noto officiels',
    '881 genuine Google Noto animations are available. Selecting one downloads its animation once and creates a placeable Factorio stamp at the current global size.': '881 véritables animations Google Noto sont disponibles. En sélectionner une télécharge son animation une fois et crée un tampon Factorio plaçable à la taille globale actuelle.',
    'An internet connection is required the first time an animation is selected.': 'Une connexion Internet est nécessaire lors de la première sélection d’une animation.',
    'Noto Animated Emoji by Google, licensed under CC BY 4.0.': 'Noto Animated Emoji par Google, sous licence CC BY 4.0.',
    'Search animated emoji by name or symbol': 'Rechercher un emoji animé par nom ou symbole',
    'Animated emoji category': 'Catégorie d’emoji animé',
    'Create animated stamp': 'Créer un tampon animé',
    'Show more animated emoji': 'Afficher plus d’emojis animés',
    'No animated emoji matches this search.': 'Aucun emoji animé ne correspond à cette recherche.',
    'Smileys and emotions': 'Smileys et émotions',
    People: 'Personnes',
    'Animals and nature': 'Animaux et nature',
    'Food and drink': 'Nourriture et boissons',
    'Travel and places': 'Voyages et lieux',
    'Activities and events': 'Activités et événements',
    'Smileys & Emotion': 'Smileys et émotions',
    'People & Body': 'Personnes et corps',
    'Animals & Nature': 'Animaux et nature',
    'Food & Drink': 'Nourriture et boissons',
    'Travel & Places': 'Voyages et lieux',
    Activities: 'Activités',
    Objects: 'Objets',
    Symbols: 'Symboles',
    Flags: 'Drapeaux',
    'Monospaced fonts': 'Polices à chasse fixe',
    'Proportional fonts': 'Polices proportionnelles',
    'Bundled fonts': 'Polices intégrées',
    'System fonts': 'Polices système',
    'Imported fonts': 'Polices importées',
    'Bundled fonts render identically on every OS. Only detected system fonts are listed; imported fonts remain available for this session.': 'Les polices intégrées ont un rendu identique sur chaque OS. Seules les polices système détectées sont affichées ; les polices importées restent disponibles pendant cette session.',
    'Monospaced fonts keep the same width for every character and are commonly used in IDEs and terminals. Proportional fonts use a width adapted to each character.': 'Les polices à chasse fixe donnent la même largeur à chaque caractère et sont courantes dans les IDE et les terminaux. Les polices proportionnelles adaptent la largeur à chaque caractère.',
    'Loading font…': 'Chargement de la police…',
    'Font loaded': 'Police chargée',
    'Unsupported or invalid font': 'Police non prise en charge ou invalide',
    'EMOJI STYLE': 'STYLE DES EMOJIS',
    'Automatic (OS native)': 'Automatique (natif de l’OS)',
    Automatic: 'Automatique',
    Detected: 'détecté',
    'Noto Color Emoji (bundled)': 'Noto Color Emoji (intégrée)',
    'not available on this OS': 'indisponible sur cet OS',
    'not detected on this OS': 'non détectée sur cet OS',
    'Detecting system fonts…': 'Détection des polices système…',
    'system font families detected': 'familles de polices système détectées',
    'fallback system font families available': 'familles de secours disponibles',
    'Limit display width': 'Limiter la largeur d’affichage',
    'Limit display area': 'Limiter la zone d’affichage',
    'Zone width (cells)': 'Largeur de la zone (cases)',
    'Zone height (cells)': 'Hauteur de la zone (cases)',
    'Scroll direction': 'Sens de défilement',
    'Right to left': 'De droite à gauche',
    'Left to right': 'De gauche à droite',
    'Top to bottom': 'De haut en bas',
    'Bottom to top': 'De bas en haut',
    'Seconds / step': 'Secondes / étape',
    'Ticks / step': 'Ticks / étape',
    'Cells / second': 'Cases / seconde',
    Increase: 'Augmenter',
    Decrease: 'Diminuer',
    'One step moves the text by one cell. Timing is quantized to whole Factorio ticks (60 ticks/s; minimum 2 ticks).': 'Une étape déplace le texte d’une case. La durée est quantifiée en ticks Factorio entiers (60 ticks/s ; minimum 2 ticks).',
    'Scroll horizontally when the text exceeds the zone': 'Faire défiler horizontalement lorsque le texte dépasse la zone',
    'Scroll when the text exceeds the zone': 'Faire défiler le texte lorsqu’il dépasse la zone',
    'Height follows the largest characters automatically. A one-cell empty border is kept on all four sides.': 'La hauteur suit automatiquement les plus grands caractères. Une bordure vide d’une case est conservée sur les quatre côtés.',
    'Width follows the largest characters automatically. A one-cell empty border is kept on all four sides.': 'La largeur suit automatiquement les plus grands caractères. Une bordure vide d’une case est conservée sur les quatre côtés.',
    'Selected text formatting': 'Mise en forme du texte sélectionné',
    Selection: 'Sélection',
    Bold: 'Gras',
    Italic: 'Italique',
    Underline: 'Souligné',
    Paste: 'Coller',
    Copy: 'Copier',
    Cut: 'Couper',
    'Select all': 'Tout sélectionner',
    'Canvas reset.': 'Zone de dessin réinitialisée.',
    'Converting image...': 'Conversion de l’image…',
    'Decoding GIF/video with FFmpeg...': 'Décodage du GIF/de la vidéo avec FFmpeg…',
    'Legacy GIF repaired: all embedded image frames were recovered and missing timing was reconstructed at 10 FPS.': 'GIF ancien réparé : toutes les images intégrées ont été récupérées et la temporisation manquante a été reconstruite à 10 FPS.',
    'embedded frames found': 'images intégrées détectées',
    'Extracting approximate left/right piano notes with FFmpeg...': 'Extraction des notes approximatives gauche/droite avec FFmpeg…',
    'Blueprint Copied!': 'Blueprint copiée !',
    'Blueprint generation failed.': 'Échec de la génération de la blueprint.',
    'Unable to generate the blueprint.': 'Impossible de générer la blueprint.',
    'Unable to copy the blueprint to the clipboard.': 'Impossible de copier la blueprint dans le presse-papiers.',
    'Save Blueprint': 'Enregistrer la blueprint',
    'Save the last generated blueprint without generating it again': 'Enregistrer la dernière blueprint générée sans la générer de nouveau',
    'Blueprint controller preview': 'Aperçu du contrôleur de blueprint',
    'These footprints are the combinators, controller substations, relays, speakers, and optional display that will be exported with the current animation.': 'Ces empreintes représentent les combinators, substations du contrôleur, relais, speakers et l’écran facultatif qui seront exportés avec l’animation actuelle.',
    'Clipboard copy failed. The new blueprint is ready to save.': 'La copie dans le presse-papiers a échoué. La nouvelle blueprint peut être enregistrée.',
    'Unable to save the generated blueprint to a file.': 'Impossible d’enregistrer la blueprint générée dans un fichier.',
    'Unable to copy the new blueprint to the clipboard. The previous clipboard content was cleared; use Save Blueprint to keep this generated result.': 'Impossible de copier la nouvelle blueprint dans le presse-papiers. L’ancien contenu du presse-papiers a été effacé ; utilisez Enregistrer la blueprint pour conserver ce résultat.',
    'The clipboard copy failed, but the newly generated blueprint was saved to:': 'La copie dans le presse-papiers a échoué, mais la nouvelle blueprint a été enregistrée ici :',
    'Audio-to-speaker conversion is available in the installed desktop application.': 'La conversion audio vers speakers est disponible dans l’application de bureau installée.',
    'GIF/video import is available in the installed desktop application.': 'L’importation GIF/vidéo est disponible dans l’application de bureau installée.',
    'Add at least one slideshow image before generating the blueprint.': 'Ajoutez au moins une image au diaporama avant de générer la blueprint.',
    'Unable to convert this audio file.': 'Impossible de convertir ce fichier audio.',
    'Unable to decode this GIF/video.': 'Impossible de décoder ce GIF/cette vidéo.',
    'Unable to import one of the slideshow images.': 'Impossible d’importer l’une des images du diaporama.',
    'FFmpeg preserves the ratio, fits the media inside': 'FFmpeg conserve les proportions, ajuste le média dans',
    ', and never exceeds 30 FPS.': ', et ne dépasse jamais 30 FPS.',
    'and never exceeds 30 FPS.': 'et ne dépasse jamais 30 FPS.',
    Text: 'Texte',
    'FFmpeg detects one dominant pitch per left/right channel. Factorio allows at most one new sample per tick: 1–60 notes/s; 4–8 is recommended. The result uses two native speakers, not the original waveforms.': 'FFmpeg détecte une hauteur dominante par canal gauche/droit. Factorio autorise au maximum un nouvel échantillon par tick : 1 à 60 notes/s ; une valeur de 4 à 8 est recommandée. Le résultat utilise deux speakers natifs et non les formes d’onde d’origine.',
    'Auto selects the native instrument whose pitch range clips the fewest detected notes. Each speaker keeps one instrument for the whole track.': 'Auto sélectionne l’instrument natif dont la plage tronque le moins de notes détectées. Chaque speaker conserve le même instrument pendant toute la piste.',
    'Tick 0 is shared with the animation timer.': 'Le tick 0 est partagé avec le minuteur de l’animation.',
    'The video loop is shorter, so playback uses its first': 'La boucle vidéo est plus courte ; la lecture utilise donc ses premières',
    'seconds before both restart.': 'secondes avant que les deux redémarrent.',
    'Navigation and shortcuts': 'Navigation et raccourcis',
    'Multi-image slideshow help': 'Aide du diaporama multi-images',
    'GIF / video animation help': 'Aide de l’animation GIF / vidéo',
    'Audio and programmable speakers': 'Audio et programmable speakers',
    Exporting: 'Exportation',
    Heart: 'Cœur',
    Sparkle: 'Étincelles',
    Fire: 'Feu',
    Moon: 'Lune',
    Signal: 'Signal',
    'Loading emoji library…': 'Chargement de la bibliothèque d’emojis…',
};

const REVERSE_TRANSLATIONS = new Map(
    Object.entries(FRENCH_TRANSLATIONS).map(([english, french]) => [french, english]),
);

interface DynamicTranslation {
    english: RegExp;
    french: RegExp;
    toFrench: string;
    toEnglish: string;
}

const DYNAMIC_TRANSLATIONS: DynamicTranslation[] = [
    { english: /^Blueprint generated · (.+) characters · copying…$/, french: /^Blueprint générée · (.+) caractères · copie…$/, toFrench: 'Blueprint générée · $1 caractères · copie…', toEnglish: 'Blueprint generated · $1 characters · copying…' },
    { english: /^Blueprint saved to (.+)$/, french: /^Blueprint enregistrée dans (.+)$/, toFrench: 'Blueprint enregistrée dans $1', toEnglish: 'Blueprint saved to $1' },
    { english: /^(\S[\s\S]*?) loaded$/, french: /^(\S[\s\S]*?) chargée$/, toFrench: '$1 chargée', toEnglish: '$1 loaded' },
    { english: /^(\d[\d\s,.]*) stereo note events extracted$/, french: /^(\d[\d\s,.]*) événements de notes stéréo extraits$/, toFrench: '$1 événements de notes stéréo extraits', toEnglish: '$1 stereo note events extracted' },
    { english: /^(\d[\d\s,.]*) frames loaded at (.+) FPS$/, french: /^(\d[\d\s,.]*) images chargées à (.+) FPS$/, toFrench: '$1 images chargées à $2 FPS', toEnglish: '$1 frames loaded at $2 FPS' },
    { english: /^(\d[\d\s,.]*) frames found; choose (\d[\d\s,.]*) or fewer\.$/, french: /^(\d[\d\s,.]*) images trouvées ; choisissez-en (\d[\d\s,.]*) ou moins\.$/, toFrench: '$1 images trouvées ; choisissez-en $2 ou moins.', toEnglish: '$1 frames found; choose $2 or fewer.' },
    { english: /^Converting (\d[\d\s,.]*) slideshow frame\(s\)\.\.\.$/, french: /^Conversion de (\d[\d\s,.]*) image\(s\) du diaporama…$/, toFrench: 'Conversion de $1 image(s) du diaporama…', toEnglish: 'Converting $1 slideshow frame(s)...' },
    { english: /^(\d[\d\s,.]*) slideshow frames loaded\.$/, french: /^(\d[\d\s,.]*) images du diaporama chargées\.$/, toFrench: '$1 images du diaporama chargées.', toEnglish: '$1 slideshow frames loaded.' },
    { english: /^Converting (.+)\.\.\.$/, french: /^Conversion de (.+)…$/, toFrench: 'Conversion de $1…', toEnglish: 'Converting $1...' },
    { english: /^Generating blueprint… (\d+)% · (.+) s · (.+)\+ entities$/, french: /^Génération de la blueprint… (\d+)% · (.+) s · (.+)\+ entités$/, toFrench: 'Génération de la blueprint… $1% · $2 s · $3+ entités', toEnglish: 'Generating blueprint… $1% · $2 s · $3+ entities' },
    { english: /^(\d[\d\s,.]*) animated text frames created\.$/, french: /^(\d[\d\s,.]*) images de texte animé créées\.$/, toFrench: '$1 images de texte animé créées.', toEnglish: '$1 animated text frames created.' },
    { english: /^(\d[\d\s,.]*) imported frame(s?)$/, french: /^(\d[\d\s,.]*) image(s?) importée(s?)$/, toFrench: '$1 image$2 importée$2', toEnglish: '$1 imported frame$2' },
    { english: /^Multi images · (\d[\d\s,.]*) frame(s?)$/, french: /^Multi-images · (\d[\d\s,.]*) image(s?)$/, toFrench: 'Multi-images · $1 image$2', toEnglish: 'Multi images · $1 frame$2' },
    { english: /^Apply selection \((.+) kept\)$/, french: /^Appliquer la sélection \((.+) conservées\)$/, toFrench: 'Appliquer la sélection ($1 conservées)', toEnglish: 'Apply selection ($1 kept)' },
    { english: /^Frame (\d+)$/, french: /^Image (\d+)$/, toFrench: 'Image $1', toEnglish: 'Frame $1' },
    { english: /^Remove frame (\d+)$/, french: /^Supprimer l’image (\d+)$/, toFrench: 'Supprimer l’image $1', toEnglish: 'Remove frame $1' },
    { english: /^Preview frame (\d+): (.+)$/, french: /^Afficher l’image (\d+) : (.+)$/, toFrench: 'Afficher l’image $1 : $2', toEnglish: 'Preview frame $1: $2' },
    { english: /^Character (\d+)$/, french: /^Caractère (\d+)$/, toFrench: 'Caractère $1', toEnglish: 'Character $1' },
    { english: /^Insert (.+)$/, french: /^Insérer (.+)$/, toFrench: 'Insérer $1', toEnglish: 'Insert $1' },
    { english: /^Showing (\d[\d\s,.]*) of (\d[\d\s,.]*) emoji$/, french: /^(\d[\d\s,.]*) emojis affichés sur (\d[\d\s,.]*)$/, toFrench: '$1 emojis affichés sur $2', toEnglish: 'Showing $1 of $2 emoji' },
    { english: /^This animation has (.+) frames\. Reduce it to (.+) frames or raise the frame limit in Settings\.$/, french: /^Cette animation comporte (.+) images\. Réduisez-la à (.+) images ou augmentez la limite dans les paramètres\.$/, toFrench: 'Cette animation comporte $1 images. Réduisez-la à $2 images ou augmentez la limite dans les paramètres.', toEnglish: 'This animation has $1 frames. Reduce it to $2 frames or raise the frame limit in Settings.' },
];

const translateCore = (text: string, language: InterfaceLanguage) => {
    if (!text) return text;
    if (language === 'fr') {
        // The observer may already have applied the global space before a
        // colon. Translation keys remain canonical English punctuation.
        const canonicalEnglish = text.replace(/\s+:/g, ':');
        const exact = FRENCH_TRANSLATIONS[canonicalEnglish];
        if (exact) return exact;
        for (const translation of DYNAMIC_TRANSLATIONS) {
            if (translation.english.test(canonicalEnglish)) {
                return canonicalEnglish.replace(translation.english, translation.toFrench);
            }
        }
        return text;
    }
    const exact = REVERSE_TRANSLATIONS.get(text);
    if (exact) return exact;
    for (const translation of DYNAMIC_TRANSLATIONS) {
        if (translation.french.test(text)) return text.replace(translation.french, translation.toEnglish);
    }
    return text;
};

export const formatUiColons = (value: string): string => value.replace(
    /(\S):/g,
    (match, precedingCharacter: string, offset: number) => {
        const followingCharacter = value[offset + match.length] ?? '';
        const tokenStart = Math.max(
            value.lastIndexOf(' ', offset),
            value.lastIndexOf('\n', offset),
            value.lastIndexOf('\t', offset),
        ) + 1;
        const remainingToken = value.slice(offset + match.length);
        const tokenTailLength = remainingToken.search(/\s/);
        const tokenEnd = tokenTailLength === -1
            ? value.length
            : offset + match.length + tokenTailLength;
        const token = value.slice(tokenStart, tokenEnd);
        const technicalColon = followingCharacter === '/'
            || followingCharacter === '\\'
            || (/\d/.test(precedingCharacter) && /\d/.test(followingCharacter))
            || /^[a-z][a-z\d+.-]*:\/\//i.test(token);
        return technicalColon ? match : `${precedingCharacter} :`;
    },
);

export const translateUiString = (value: string, language: InterfaceLanguage): string => {
    if (!value) return value;
    if (value.includes('\n')) return value.split('\n').map(line => translateUiString(line, language)).join('\n');
    const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const translated = match
        ? `${match[1]}${translateCore(match[2], language)}${match[3]}`
        : translateCore(value, language);
    // French-style spacing is intentionally used in both interface languages.
    // Protocols, Windows/Unix paths, and clock values keep their technical colon.
    return formatUiColons(translated);
};

interface I18nValue {
    language: InterfaceLanguage;
    setLanguage: (language: InterfaceLanguage) => void;
    t: (text: string) => string;
}

const I18nContext = React.createContext<I18nValue | null>(null);

const shouldSkipTranslation = (element: Element | null) => (
    Boolean(element?.closest('[data-no-translate="true"], [contenteditable="true"]'))
);

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [language, setLanguage] = React.useState<InterfaceLanguage>(() => {
        if (typeof window === 'undefined') return 'en';
        return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'fr' ? 'fr' : 'en';
    });

    const t = React.useCallback((text: string) => translateUiString(text, language), [language]);

    React.useEffect(() => {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        document.documentElement.lang = language;

        const translateTextNode = (node: Text) => {
            if (shouldSkipTranslation(node.parentElement)) return;
            const translated = translateUiString(node.nodeValue ?? '', language);
            if (translated !== node.nodeValue) node.nodeValue = translated;
        };
        const translateElementAttributes = (element: Element) => {
            if (shouldSkipTranslation(element)) return;
            ['title', 'aria-label', 'placeholder'].forEach(attribute => {
                const current = element.getAttribute(attribute);
                if (current === null) return;
                const translated = translateUiString(current, language);
                if (translated !== current) element.setAttribute(attribute, translated);
            });
        };
        const translateTree = (root: Node) => {
            if (root.nodeType === Node.TEXT_NODE) {
                translateTextNode(root as Text);
                return;
            }
            if (!(root instanceof Element) && root !== document.body) return;
            if (root instanceof Element) translateElementAttributes(root);
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let current = walker.nextNode();
            while (current) {
                if (current.nodeType === Node.TEXT_NODE) translateTextNode(current as Text);
                else translateElementAttributes(current as Element);
                current = walker.nextNode();
            }
        };

        translateTree(document.body);
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'characterData') translateTextNode(mutation.target as Text);
                else if (mutation.type === 'attributes') translateElementAttributes(mutation.target as Element);
                else mutation.addedNodes.forEach(translateTree);
            });
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['title', 'aria-label', 'placeholder'],
            characterData: true,
            childList: true,
            subtree: true,
        });

        const originalAlert = window.alert;
        const originalConfirm = window.confirm;
        const originalPrompt = window.prompt;
        window.alert = message => originalAlert.call(window, translateUiString(String(message ?? ''), language));
        window.confirm = message => originalConfirm.call(window, translateUiString(String(message ?? ''), language));
        window.prompt = (message, defaultValue) => originalPrompt.call(
            window,
            translateUiString(String(message ?? ''), language),
            defaultValue,
        );

        return () => {
            observer.disconnect();
            window.alert = originalAlert;
            window.confirm = originalConfirm;
            window.prompt = originalPrompt;
        };
    }, [language]);

    const value = React.useMemo(() => ({ language, setLanguage, t }), [language, t]);
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
    const value = React.useContext(I18nContext);
    if (!value) throw new Error('useI18n must be used inside I18nProvider');
    return value;
};
