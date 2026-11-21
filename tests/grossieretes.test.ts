import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filtrer } from '../supabase/functions/courrier/grossieretes';

const passe = (t: string) => {
  const v = filtrer(t);
  assert.equal(v.interdit, false, `refusé à tort : « ${t} »`);
  assert.equal(v.remplaces, 0, `modifié à tort : « ${t} » → « ${v.texte} »`);
};
const remplace = (t: string, n = 1) => {
  const v = filtrer(t);
  assert.equal(v.interdit, false, `refusé au lieu de remplacé : « ${t} »`);
  assert.equal(v.remplaces, n, `« ${t} » → « ${v.texte} » (${v.remplaces} remplacé(s), ${n} attendu(s))`);
  return v.texte;
};
const refuse = (t: string) => assert.equal(filtrer(t).interdit, true, `aurait dû être refusé : « ${t} »`);

test('les lettres normales passent sans retouche', () => {
  for (const t of [
    'Merci Chuck, t’es le meilleur !',
    'J’ai acheté un concombre et des conserves pour la connexion du siècle.',
    'Ma salopette est tachée de moutarde, c’est niquel quand même.',
    'Je suis content, concentré, consterné et convaincu.',
    'Les pros et les contres : Chuck a toujours raison.',
    'Branle-bas de combat au Ministère !',
    'Le bocal résiste. Ma chatte s’appelle Olive.',
    'Je crève de faim après Olive Storm.',
    'C’était une partie de dingue, quelle bataille !',
    'Scunthorpe, Essex, Middlesex : Chuck connaît tout le monde.',
    'Il fallait 12 coups au niveau 40, j’en ai fait 11 !!!',
    'Dickens et Sputnik passent par la pinède.',
    'Respect total. Bisous à Jean-Mi.',
  ]) passe(t);
});

test('les gros mots sont remplacés par des condiments', () => {
  assert.match(remplace('Jean-Mi est un connard.'), /^Jean-Mi est un [a-z]+\.$/);
  remplace('MERDE, j’ai raté le bocal');
  remplace('putain de cornichon');
  remplace('Quel enculé ce Jean-Mi');
  remplace('t’es con ou quoi');
  remplace('fuck this jar');
  remplace('ta gueule Jean-Mi');
  remplace('fils de pute');
  remplace('merde et re-merde', 2);
});

test('les contournements courants sont repérés', () => {
  remplace('Jean-Mi est un connnnnnard');
  remplace('c0nn4rd');
  remplace('p u t a i n');
  remplace('p.u.t.a.i.n de bocal');
  remplace('CôNNaRD');
  remplace('сonnard'); // « с » cyrillique
  remplace('merde!!!');
});

test('la casse du gros mot est reprise', () => {
  assert.match(remplace('Connard !'), /^[A-Z][a-z]+ !$/);
  assert.match(remplace('CONNARD'), /^[A-Z]+$/);
});

test('les insultes haineuses sont refusées', () => {
  refuse('sale arabe');
  refuse('Sale   Juif');
  refuse('espèce de pédé');
  refuse('PD');
  refuse('n3gr0');
  refuse('heil hitler');
  refuse('va mourir Jean-Mi');
  refuse('kys');
});

test('même texte, même résultat', () => {
  assert.equal(filtrer('Jean-Mi est un connard', 5).texte, filtrer('Jean-Mi est un connard', 5).texte);
});
