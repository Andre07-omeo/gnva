import { NextRequest, NextResponse } from 'next/server';
export function proxy(req:NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const developpement=process.env.NODE_ENV!=='production';
  const politique=[
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developpement?" 'unsafe-eval'":''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self'${developpement?' ws: wss:':''}`,
    "object-src 'none'","base-uri 'self'","form-action 'self'",
    `frame-ancestors 'self'${developpement?' https://replit.com https://*.replit.com https://*.replit.dev':''}`,
  ].join('; ');
  const headers=new Headers(req.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',politique);
  const retour=NextResponse.next({request:{headers}});
  retour.headers.set('Content-Security-Policy',politique);
  if(!developpement) retour.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  return retour;
}
export const config={matcher:['/((?!api|_next/static|_next/image|icons|sw.js|manifest.webmanifest|offline.html).*)']};