import { NextRequest } from 'next/server';
import { traiter } from '@/server/router';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Parametres={params:Promise<{segments?:string[]}>};
async function executer(req:NextRequest,options:Parametres) {
  return traiter(req,(await options.params).segments??[]);
}
export { executer as GET, executer as POST, executer as PATCH, executer as DELETE };