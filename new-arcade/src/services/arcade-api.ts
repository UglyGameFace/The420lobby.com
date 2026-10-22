export interface ArcadeSession {
  user: {id:string;username:string;avatarUrl:string}|null;
  csrfToken:string|null;
  configured:boolean;
}
export interface ArcadeProfile {
  user:{id:string;username:string;avatarUrl:string};
  stats:{runs:number;totalScore:number;gamesPlayed:number};
  achievements:{id:string;unlockedAt:number}[];
}
export interface ArcadeRunStart {id:string;game:string;expiresAt:number}
export interface ArcadeRunSaved {id:string;game:string;score:number;best:number;isPersonalBest:boolean;verification:string}
export interface ArcadeBoardEntry {rank:number;game:string;score:number;playedAt:number;user:{id:string;username:string;avatarUrl:string}}
export interface ArcadeBoard {entries:ArcadeBoardEntry[];period:string;game:string;verification:string}

export async function arcadeRequest<T>(path:string,body?:Record<string,unknown>,csrfToken?:string):Promise<T>{
  const response=await fetch(path,{
    method:body ? "POST" : "GET",
    credentials:"same-origin",
    cache:"no-store",
    headers:{"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{}),
      ...(csrfToken?{"X-CSRF-Token":csrfToken}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error?.message || "The arcade service could not complete the request.");
  if(!payload || typeof payload!=="object") throw new Error("The arcade server returned an invalid response.");
  return payload as T;
}
