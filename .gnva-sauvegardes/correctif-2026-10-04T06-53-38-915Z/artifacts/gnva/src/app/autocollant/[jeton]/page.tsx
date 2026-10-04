import Link from 'next/link';
import { publicAutocollant } from '@/server/autocollants';
export const dynamic='force-dynamic';
export const metadata={title:'GNVA — Vérification publique'};
export default async function PagePublique({params}:{params:Promise<{jeton:string}>}) {
  const {jeton}=await params;
  let fiche:Awaited<ReturnType<typeof publicAutocollant>>;
  try {fiche=await publicAutocollant(jeton);} catch {
    return <main style={{maxWidth:680,margin:'8vh auto',padding:24}} className="card pad"><h1>Autocollant introuvable</h1><p>Ce code n’est pas enregistré ou le service de vérification est indisponible. Contactez un agent GNVA pour contrôle.</p><Link href="/">Accéder à GNVA</Link></main>;
  }
  const champs=[['Nom',fiche.nom],['Postnom',fiche.postnom],['Prénom',fiche.prenom],['Timbre',fiche.numeroTimbre],['Autocollant',fiche.numeroAutocollant],['Plaque',fiche.plaque],['Châssis',fiche.chassis],['Moteur',fiche.moteur],['Exercice',fiche.exercice],['Attribution',fiche.dateAttribution?.toISOString()]];
  return <main style={{maxWidth:700,margin:'4vh auto',padding:20}}><div className="card pad">
    <p style={{color:'#1757aa',fontWeight:700}}>GNVA · DISPROMALT</p><h1 style={{fontSize:26}}>Vérification d’un autocollant</h1><p>Informations publiques de validation</p>
    {fiche.vole && <div role="alert" style={{background:'#fff0f0',border:'2px solid #ba2525',padding:16,color:'#9d1717',fontWeight:700}}>ALERTE : cette moto est déclarée volée. Contactez un administrateur pour vérification.</div>}
    <p><span className="badge info">{fiche.statut}</span></p>
    {fiche.photoUrl && <img src={fiche.photoUrl} width="150" height="150" style={{objectFit:'cover',borderRadius:12}} alt="Photo de l’assujetti"/>}
    <dl className="kv">{champs.map(([cle,v])=><div key={String(cle)} style={{display:'contents'}}><dt>{cle}</dt><dd>{v??'Non renseigné'}</dd></div>)}</dl>
    {!fiche.dateAttribution && <p>Cet autocollant n’a pas encore été attribué.</p>}
    <p style={{color:'#64748b',fontSize:12}}>Aucune donnée financière ou administrative privée n’est affichée.</p><Link href="/">Accès réservé aux agents</Link>
  </div></main>;
}