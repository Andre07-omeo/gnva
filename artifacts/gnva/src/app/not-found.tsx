import Link from 'next/link';
export default function Introuvable() {
  return <main className="card pad" style={{maxWidth:520,margin:'10vh auto'}}><h1>Page introuvable</h1><p>Cette adresse ne correspond pas à une page GNVA disponible.</p><Link className="btn" href="/">Revenir à l’application</Link></main>;
}