require('dotenv').config(); // Charge les variables d'environnement du fichier .env

const express = require('express');
const { google } = require('googleapis');
const cors = require('cors'); // Pour permettre les requêtes depuis votre front-end React
const path = require('path');
const fs = require('fs');

const app = express();

const port = process.env.PORT || 5001; // Le port sur lequel votre serveur Node.js va écouter
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const hostname = process.env.IP || '127.0.0.1'; // Valeur par défaut si non défini

// Middleware pour permettre les requêtes cross-origin depuis votre application React
// Assurez-vous que l'URL de votre front-end React est correcte (par défaut, c'est http://localhost:3000)
app.use(cors({ origin: allowedOrigin }));
app.use(express.json()); // Pour parser les requêtes JSON si besoin

// --- Configuration de l'API Google Sheets ---
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // Chemin vers votre fichier JSON de credentials
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], // Scope pour la lecture seule
});

// Remplacez avec l'ID de votre feuille Google Sheets
// C'est la partie entre /d/ et /edit dans l'URL de votre feuille
const spreadsheetId = process.env.SPREAD_SHEET_ID;

// Fonction pour récupérer les données d'une feuille spécifique
async function getSheetData(sheetName) {
    try {
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A:Z`, // Récupère toutes les colonnes de la feuille
        });

        return response.data.values;
    } catch (error) {
        console.error(`Erreur lors de la récupération des données de la feuille ${sheetName}:`, error);
        throw new Error(`Impossible de récupérer les données de la feuille ${sheetName}`);
    }
}
// Fonction utilitaire pour formater une date ExcelJS en "DD/MM/YYYY"
function formaterDate(val) {
  if (val instanceof Date) {
    return val.toLocaleDateString('fr-FR');
  }
  return val;
}

// Lecture d'une feuille sans les en-têtes, avec évaluation des formules
async function lireFeuille(feuille) {
  const donnees = [];

  feuille.eachRow((row, rowNumber) => {
    if (row.actualCellCount === 0) return;

    const valeurs = row.values.slice(1).map(cell => {
      let valeur = (cell && typeof cell === 'object' && 'result' in cell) ? cell.result : cell;
      return formaterDate(valeur);
    });

    donnees.push(valeurs);
  });

  return donnees.slice(1); // Ignorer les en-têtes
}

// Fonction de nettoyage et fusion des données
function nettoyerEtFusionner(google, archives) {
  const colonnesNumeriques = [3, 4, 5, 6, 7]; // index Mois, Nb Nuits, Nb Adultes, Prix/Nuit, Revenus

  const nettoyer = (ligne) => {
    if (!Array.isArray(ligne)) return null;
const cleaned = ligne.map((val, i) => {
  if (typeof val === 'string') val = val.trim();
  if (colonnesNumeriques.includes(i)) {
    if (typeof val === 'string') {
      // Gestion des espaces insécables, séparateurs français
      const cleanedVal = val.replace(/[\s ]/g, '').replace(',', '.');
      const match = cleanedVal.match(/-?\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : (typeof val === 'number' ? val : null);
    }
    return typeof val === 'number' ? val : null;
  }
  return val === '' ? null : val;
});
    return cleaned.every(v => v === null || v === '') ? null : cleaned;
  };

  const uniqueKey = (ligne) => JSON.stringify(ligne);

  const nettoyeesGoogle = google.map(nettoyer).filter(Boolean);
  const nettoyeesArchives = archives.map(nettoyer).filter(Boolean);

  const titres = nettoyeesGoogle[0];
  const contenu = [...nettoyeesGoogle.slice(1), ...nettoyeesArchives];

  const vus = new Set();
  const fusion = [titres];

  for (const ligne of contenu) {
    const cle = uniqueKey(ligne);
    if (!vus.has(cle)) {
      vus.add(cle);
for (const partie of decouperSiChevaucheDeuxMois(ligne)) {
  fusion.push(partie);
}

    }
  }

  // Tri sur la première date rencontrée dans la ligne
  fusion.sort((a, b) => {
    const getDate = (ligne) => {
      for (const val of ligne) {
        if (typeof val === 'string' && val.match(/\d{2}\/\d{2}\/\d{4}/)) {
          const [d, m, y] = val.split('/');
          return new Date(`${y}-${m}-${d}`);
        }
      }
      return new Date('2100-01-01');
    };
    return getDate(a) - getDate(b);
  });

// Fonction utilitaire pour parser une date "DD/MM/YYYY"
// Fonction utilitaire pour parser une date "DD/MM/YYYY"
const parseDate = (str) => {
  if (!str || typeof str !== 'string' || !str.includes('/')) return null;
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return new Date(`${y}-${m}-${d}`);
};

// Fonction utilitaire pour formater une date JS en "DD/MM/YYYY"
const formatDate = (date) =>
  date.toLocaleDateString('fr-FR').split('/').map(s => s.padStart(2, '0')).join('/');

// Fonction pour calculer les nuits entre deux dates (non inclusif de la fin)
const calculerNuits = (debut, fin) => {
  const msParNuit = 1000 * 60 * 60 * 24;
  return Math.round((fin - debut) / msParNuit);
};

// Traitement pour scinder les lignes qui chevauchent deux mois
const lignesFractionnees = [fusion[0]]; // garder les titres

for (let i = 1; i < fusion.length; i++) {
  const ligne = fusion[i];
  const nom = ligne[0];
  const debutStr = ligne[1];
  const finStr = ligne[2];
  const nbNuits = ligne[3];

  const debut = parseDate(debutStr);
  const fin = parseDate(finStr);

  // Si l'une des dates est invalide, on garde la ligne telle quelle
  if (!debut || !fin) {
    lignesFractionnees.push(ligne);
    continue;
  }

  // Vérifie si la réservation chevauche deux mois
  if (
    debut.getMonth() !== fin.getMonth() ||
    debut.getFullYear() !== fin.getFullYear()
  ) {
    const finPremierMois = new Date(debut.getFullYear(), debut.getMonth() + 1, 0);
    const debutDeuxiemeMois = new Date(fin.getFullYear(), fin.getMonth(), 1);

    const nuits1 = calculerNuits(debut, new Date(finPremierMois.getFullYear(), finPremierMois.getMonth(), finPremierMois.getDate() + 1));
    const nuits2 = calculerNuits(debutDeuxiemeMois, fin);

    if (nuits1 > 0) {
      const ligne1 = [...ligne];
      ligne1[1] = formatDate(debut);
      ligne1[2] = formatDate(finPremierMois);
      ligne1[3] = nuits1;
      lignesFractionnees.push(ligne1);
    }

    if (nuits2 > 0) {
      const ligne2 = [...ligne];
      ligne2[1] = formatDate(debutDeuxiemeMois);
      ligne2[2] = formatDate(fin);
      ligne2[3] = nuits2;
      lignesFractionnees.push(ligne2);
    }
  } else {
    lignesFractionnees.push(ligne);
  }
}

return lignesFractionnees;


}


// Route enrichie pour Google + Archives
app.get( process.env.REACT_APP_BACKEND_URI, async (req, res) => {
  try {
    const gites = ['Phonsine', 'Gree', 'Edmond', 'Liberté'];
    const allGiteData = {};

    const archivesPath = path.join(__dirname, 'archives', 'archives.json');
    const archives = JSON.parse(fs.readFileSync(archivesPath, 'utf-8'));

    for (const gite of gites) {
      const googleData = await getSheetData(gite);
      const archiveData = archives[gite] || [];
      const fusion = nettoyerEtFusionner(googleData, archiveData);
      allGiteData[gite] = fusion;
    }
    // Ajout des données d'archives
    res.json(allGiteData);
  } catch (error) {
    console.error('Erreur lors de la fusion des données :', error);
    res.status(500).json({ message: error.message });
  }
});


// Démarrage du serveur
app.listen(port, () => {
     console.log(`Serveur backend lancé sur http://${hostname}:${port}`);
});


function decouperSiChevaucheDeuxMois(ligne) {
  const prixParNuitIdx = 6;
  const revenusIdx = 7;

  const [nom, debutStr, finStr, mois, nuits, ...reste] = ligne;

  if (
    typeof debutStr !== 'string' ||
    typeof finStr !== 'string' ||
    !debutStr.match(/^\d{2}\/\d{2}\/\d{4}$/) ||
    !finStr.match(/^\d{2}\/\d{2}\/\d{4}$/)
  ) {
    return [ligne];
  }

  const [d1, m1, y1] = debutStr.split('/').map(Number);
  const [d2, m2, y2] = finStr.split('/').map(Number);
  const debut = new Date(y1, m1 - 1, d1);
  const fin = new Date(y2, m2 - 1, d2);

  // Cas particulier : date de fin est le 1er du mois suivant → on garde tout sur le mois de début
  if (
    debut.getMonth() === fin.getMonth() && debut.getFullYear() === fin.getFullYear()
    ||
    (fin.getDate() === 1 && (
      (fin.getMonth() > debut.getMonth() && fin.getFullYear() === debut.getFullYear()) ||
      (fin.getMonth() === 0 && debut.getMonth() === 11 && fin.getFullYear() === debut.getFullYear() + 1)
    ))
  ) {
    return [ligne];
  }

  // Trouver le dernier jour de ce mois
  const finMoisDate = new Date(debut.getFullYear(), debut.getMonth() + 1, 0);

  // Le jour après le dernier jour du mois courant (c'est le 1er du mois suivant)
  const debutMoisSuivant = new Date(debut.getFullYear(), debut.getMonth() + 1, 1);

  // Calcul du nombre de nuits dans chaque segment :
  // Le segment 1 : du début au 1er du mois suivant (non inclusif)
  const nuits1 = Math.round((debutMoisSuivant - debut) / (1000 * 60 * 60 * 24));
  // Le segment 2 : du 1er du mois suivant à la date de fin (non inclusive)
  const nuits2 = Math.round((fin - debutMoisSuivant) / (1000 * 60 * 60 * 24));
  const prixParNuit = Number(ligne[prixParNuitIdx]);

  const results = [];

  if (nuits1 > 0) {
    const ligne1 = [...ligne];
    ligne1[1] = debutStr;
    ligne1[2] = `${String(finMoisDate.getDate()).padStart(2, '0')}/${String(finMoisDate.getMonth() + 1).padStart(2, '0')}/${finMoisDate.getFullYear()}`;
    ligne1[3] = debut.getMonth() + 1;
    ligne1[4] = nuits1;
    if (!isNaN(prixParNuit)) {
      ligne1[revenusIdx] = +(prixParNuit * nuits1).toFixed(2);
    }
    results.push(ligne1);
  }

  if (nuits2 > 0) {
    const ligne2 = [...ligne];
    ligne2[1] = `01/${String(debutMoisSuivant.getMonth() + 1).padStart(2, '0')}/${debutMoisSuivant.getFullYear()}`;
    ligne2[2] = finStr;
    ligne2[3] = fin.getMonth() + 1;
    ligne2[4] = nuits2;
    if (!isNaN(prixParNuit)) {
      ligne2[revenusIdx] = +(prixParNuit * nuits2).toFixed(2);
    }
    results.push(ligne2);
  }

  return results.length ? results : [ligne];
}
