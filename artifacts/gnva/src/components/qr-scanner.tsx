"use client";
import {useEffect,useRef,useState} from 'react';
export function QrScanner({onRead,onClose}:{onRead:(valeur:string)=>void;onClose:()=>void}) {
  const video=useRef<HTMLVideoElement>(null);
  const lecteur=useRef(onRead);
  const [erreur,setErreur]=useState('');
  useEffect(()=>{lecteur.current=onRead;},[onRead]);
  useEffect(()=>{
    let arrete=false,flux:MediaStream|undefined,temporisateur:ReturnType<typeof setTimeout>|undefined;
    void (async()=>{
      try {
        const {default:jsQR}=await import('jsqr');
        flux=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
        if(arrete){flux.getTracks().forEach(p=>p.stop());return;}
        if(!video.current)return;
        video.current.srcObject=flux;await video.current.play();
        const toile=document.createElement('canvas'),contexte=toile.getContext('2d',{willReadFrequently:true});
        const lire=()=>{
          if(arrete||!video.current||!contexte)return;
          const v=video.current;
          if(v.readyState>=2&&v.videoWidth>0) {
            const echelle=Math.min(1,640/v.videoWidth);
            toile.width=Math.round(v.videoWidth*echelle);toile.height=Math.round(v.videoHeight*echelle);
            contexte.drawImage(v,0,0,toile.width,toile.height);
            const image=contexte.getImageData(0,0,toile.width,toile.height);
            const code=jsQR(image.data,image.width,image.height);
            if(code?.data){arrete=true;flux?.getTracks().forEach(p=>p.stop());lecteur.current(code.data);return;}
          }
          temporisateur=setTimeout(lire,250);
        };
        lire();
      } catch {if(!arrete)setErreur("Caméra inaccessible. Autorisez l’accès, utilisez HTTPS ou saisissez le numéro manuellement.");}
    })();
    return ()=>{arrete=true;flux?.getTracks().forEach(p=>p.stop());if(temporisateur)clearTimeout(temporisateur);};
  },[]);
  return <div style={{margin:'12px 0'}}><video ref={video} playsInline muted aria-label="Caméra de lecture QR" style={{width:'100%',maxHeight:320,borderRadius:8,background:'#111'}}/>{erreur&&<p className="errbox" role="alert">{erreur}</p>}<button type="button" className="btn" onClick={onClose}>Fermer la caméra</button></div>;
}
export const valeurQr=(valeur:string)=>valeur.trim().split('/').filter(Boolean).pop()??'';