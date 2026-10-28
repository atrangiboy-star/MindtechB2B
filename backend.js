(()=>{'use strict';
const cfg=window.MINDTECH_CONFIG||{};
const key=String(cfg.supabaseAnonKey||'');
const configured=Boolean(window.supabase&&cfg.supabaseUrl&&key&&!key.includes('PASTE_')&&!key.includes('YOUR_'));
let client=null,user=null,channel=null;
const $=s=>document.querySelector(s);
function toast(msg){const el=$('#toast');if(el){el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}}
function showCloudState(){const pill=$('.preview-pill');if(pill){pill.innerHTML='<i></i> '+(user?'Shared workspace':'Sign in for team sync');pill.title=user?('Signed in as '+user.email):'Tasks are local until you sign in';}}
function renderAuth(){
 const top=$('.top-actions'); if(!top)return;
 let b=$('#authBtn');
 if(!b){b=document.createElement('button');b.id='authBtn';b.className='secondary-btn';b.style.marginLeft='8px';top.insertBefore(b,$('#themeBtn'));}
 b.textContent=user?'Sign out':(configured?'Sign in':'Backend setup');
 b.title=configured?'Sign in with your company email':'Add the Supabase public key in config.js';
 b.onclick=async()=>{if(user){const {error}=await client.auth.signOut();if(error)toast(error.message);else{user=null;if(channel)client.removeChannel(channel);showCloudState();renderAuth();toast('Signed out. This browser returns to local preview.')}}else openAuth();};
 showCloudState();
}
function openAuth(){
 let d=$('#authDialog');
 if(!d){d=document.createElement('dialog');d.id='authDialog';d.innerHTML='<form id="authForm" method="dialog" style="padding:26px;min-width:min(420px,88vw);max-width:440px"><div class="dialog-head"><div><span class="eyebrow">MINDTECHB2B ACCOUNT</span><h2 id="authTitle">Sign in</h2><p>Use your company email to access the shared workspace.</p></div><button type="button" class="icon-btn" id="authClose" aria-label="Close">×</button></div><label>Company email<input type="email" name="email" required placeholder="you@mindtechb2b.com" autocomplete="email"></label><label>Password<input type="password" name="password" required minlength="8" placeholder="At least 8 characters" autocomplete="current-password"></label><p id="authError" style="color:#c24141;min-height:16px;font-size:12px"></p><div class="dialog-actions"><button type="button" class="secondary-btn" id="authToggle">Create account</button><button class="primary-btn" type="submit" id="authSubmit">Sign in</button></div><p style="font-size:11px;color:#818a9c;margin-top:14px">Only @mindtechb2b.com email addresses are allowed.</p></form>';document.body.appendChild(d);
 d.querySelector('#authClose').onclick=()=>d.close();
 let signup=false;d.querySelector('#authToggle').onclick=()=>{signup=!signup;d.querySelector('#authTitle').textContent=signup?'Create account':'Sign in';d.querySelector('#authSubmit').textContent=signup?'Sign up':'Sign in';d.querySelector('#authToggle').textContent=signup?'Back to sign in':'Create account';d.querySelector('[name=password]').autocomplete=signup?'new-password':'current-password';d.querySelector('#authError').textContent='';};
 d.querySelector('#authForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),email=String(f.get('email')||'').trim().toLowerCase(),password=String(f.get('password')||''),err=d.querySelector('#authError'),domain=String(cfg.allowedEmailDomain||'mindtechb2b.com').toLowerCase();
 if(!configured){err.textContent='Supabase is not configured yet. Add the public key to config.js and reload.';return}
 if(!email.endsWith('@'+domain)){err.textContent='Use your @'+domain+' company email.';return}
 err.textContent='Connecting…';const submit=d.querySelector('#authSubmit');submit.disabled=true;
 try{const res=signup?await client.auth.signUp({email,password,options:{emailRedirectTo:location.href.split('#')[0]}}):await client.auth.signInWithPassword({email,password});
 if(res.error)throw res.error;
 if(signup&&!res.data.session){err.textContent='Account created. Check your company email to confirm it, then sign in.';return}
 user=res.data.user||null;d.close();await loadSharedTasks();subscribe();renderAuth();toast(user?'Signed in. Shared workspace connected.':'Check your email to confirm your account.');
 }catch(ex){err.textContent=ex.message||'Unable to authenticate.'}finally{submit.disabled=false}
 });
 }
 if(!configured){d.querySelector('#authError').textContent='Backend not configured: add the public anon/publishable key to config.js first.';d.querySelector('#authError').style.color='#b45309';d.querySelector('#authSubmit').disabled=true;d.querySelector('#authToggle').disabled=true}
 d.showModal();
}
function toApp(r){return {id:r.id,title:r.title,department:r.department,owner:r.owner,status:r.status,priority:r.priority,due:r.due||'',description:r.description||''}}
async function loadSharedTasks(){
 if(!client||!user)return;
 const {data,error}=await client.from('workspace_tasks').select('*').order('created_at',{ascending:false});
 if(error){toast('Database load failed: '+error.message);return}
 window.dispatchEvent(new CustomEvent('mindtech:tasks-loaded',{detail:(data||[]).map(toApp)}));
}
function subscribe(){
 if(!client||!user)return;
 if(channel)client.removeChannel(channel);
 channel=client.channel('mindtech-workspace-tasks').on('postgres_changes',{event:'*',schema:'public',table:'workspace_tasks'},()=>loadSharedTasks()).subscribe();
}
window.mindtechBackend={
 configured:()=>configured, signedIn:()=>Boolean(user),
 save:async tasks=>{
  if(!client||!user)return;
  const payload=tasks.map(t=>({id:String(t.id),title:t.title,department:t.department||'Operations',owner:t.owner||'Unassigned',status:t.status||'Not started',priority:t.priority||'P2',due:t.due||null,description:t.description||'',created_by:user.id,updated_at:new Date().toISOString()}));
  if(!payload.length)return;
  const {error}=await client.from('workspace_tasks').upsert(payload,{onConflict:'id'});
  if(error)toast('Shared save failed: '+error.message);
 },
 delete:async id=>{if(!client||!user)return;const {error}=await client.from('workspace_tasks').delete().eq('id',String(id));if(error)toast('Delete failed: '+error.message)},
 reload:loadSharedTasks
};
if(configured){client=window.supabase.createClient(cfg.supabaseUrl,key);client.auth.getSession().then(async({data,error})=>{if(error)toast(error.message);user=data?.session?.user||null;renderAuth();if(user){await loadSharedTasks();subscribe()}});client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;renderAuth();if(user){loadSharedTasks();subscribe()}})}
else{renderAuth();setTimeout(()=>{const pill=$('.preview-pill');if(pill){pill.innerHTML='<i></i> Local preview mode';pill.title='Configure Supabase to enable shared team data';}},0)}
})();