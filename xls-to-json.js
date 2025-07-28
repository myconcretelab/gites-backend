// Ce script Node.js utilise Express et ExcelJS
// Il lit les 4 premières feuilles de chaque fichier Excel dans ./data
// Puis compile les données dans un JSON structuré comme dans gites-data.json (sans les titres)

const express = require('express');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const dossierXLSX = path.join(__dirname, 'data-xlsx');

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

// Chargement et compilation des données des 4 premières feuilles
async function chargerDonnees() {
  const fichiers = fs.readdirSync(dossierXLSX).filter(f => f.endsWith('.xlsx'));
  const gites = {};

  for (const fichier of fichiers) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(dossierXLSX, fichier));

    for (let i = 0; i < 4 && i < workbook.worksheets.length; i++) {
      const feuille = workbook.worksheets[i];
      const nomFeuille = feuille.name.trim();

      if (!gites[nomFeuille]) gites[nomFeuille] = [];

      const donnees = await lireFeuille(feuille);
      gites[nomFeuille].push(...donnees);
    }
  }

  return gites;
}

app.get('/donnees', async (req, res) => {
  try {
    const data = await chargerDonnees();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur lors de la lecture des fichiers Excel' });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur en écoute sur http://localhost:${PORT}`);
});