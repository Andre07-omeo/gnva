"use client";
import { useEffect, useState } from 'react';
type Installation=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function InstallationPWA() {
  const [installation,setInstallation]=useState<Installation|null>(null);
  useEffect(()=>{
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const sauvegarder=(e:Event)=>{e.preventDefault();setInstallation(e as Installation);};
    const installee=()=>setInstallation(null);
    window.addEventListener('beforeinstallprompt',sauvegarder);window.addEventListener('appinstalled',installee);
    return ()=>{window.removeEventListener('beforeinstallprompt',sauvegarder);window.removeEventListener('appinstalled',installee);};
  },[]);
  if(!installation) return null;
  return <button className="btn" style={{position:'fixed',right:18,bottom:18,zIndex:40,boxShadow:'0 4px 22px #142d5540'}} onClick={async()=>{await installation.prompt();await installation.userChoice;setInstallation(null);}}>Installer GNVA sur cet appareil</button>;
}