import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { collections, getCollection, nextId, withoutMongoId, withoutMongoIds } from "@workspace/db";
import { issueSession, requireAuth, revokeSession, rotateSession } from "../middlewares/auth";
import { ensureDefaultAccount } from "../lib/accounts";
import { writeAudit } from "../lib/audit";
import { notifyUser } from "../lib/notifications";
import { SetupProfileBody, LoginBody, UpdateProfileBody, ChangePasswordBody } from "@workspace/api-zod";

const router = Router();
const authLimiter = rateLimit({ windowMs: 900_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many authentication attempts. Please wait before retrying." } });
const signupLimiter = rateLimit({ windowMs: 900_000, limit: 3, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many signup attempts. Please wait before trying again." } });
const profileResponse = (p: any) => ({ id:p.id,username:p.username,name:p.name,occupation:p.occupation,jobStatus:p.jobStatus,incomeType:p.incomeType,country:p.country,state:p.state,currency:p.currency,currencySymbol:p.currencySymbol,theme:p.theme,weekStarts:p.weekStarts,salaryFrequency:p.salaryFrequency,timezone:p.timezone,locale:p.locale,photo:p.photo,createdAt:new Date(p.createdAt).toISOString() });

router.get("/auth/check", async (_req,res)=>res.json({exists:true}));
router.post("/auth/setup", authLimiter, async (_req,res)=>res.status(410).json({error:"Direct account setup is disabled. Submit a signup request for owner approval."}));
const hashApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]!));
async function sendApprovalEmail(data: any, approveUrl: string, rejectUrl: string) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Signup approval email is not configured (RESEND_API_KEY and RESEND_FROM_EMAIL are required).");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: ["bilalqizar@gmail.com"], subject: `Finance Intelli signup request: ${data.name}`,
      html: `<h2>New Finance Intelli signup request</h2><p><b>Name:</b> ${escapeHtml(data.name)}</p><p><b>Email:</b> ${escapeHtml(data.email)}</p><p><b>Username:</b> ${escapeHtml(data.username)}</p><p>Review the request and choose an action:</p><p><a href="${approveUrl}">Review and approve</a></p><p><a href="${rejectUrl}">Review and reject</a></p><p>These links expire in 48 hours. Credentials are not included in this email.</p>` })
  });
  if (!response.ok) throw new Error("The signup approval email could not be delivered.");
}
async function sendApplicantEmail(to: string, subject: string, heading: string, message: string) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return;
  try {
    await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html: `<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(message)}</p><p>Finance Intelli</p>` }) });
  } catch { /* Account creation and approval must not be rolled back by email delivery outages. */ }
}
async function sendVerificationEmail(to: string, name: string, verifyUrl: string) {
  const apiKey=process.env.RESEND_API_KEY, from=process.env.RESEND_FROM_EMAIL;
  if(!apiKey||!from)throw new Error("Signup email is not configured (RESEND_API_KEY and RESEND_FROM_EMAIL are required).");
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject:"Confirm your Finance Intelli signup request",html:`<h2>Confirm your email</h2><p>Hello ${escapeHtml(name)}, confirm this address to send your signup request to the workspace owner for review.</p><p><a href="${verifyUrl}">Confirm email and request approval</a></p><p>This one-use link expires in 48 hours. Your account will only be created if the owner approves your request.</p>`})});
  if(!response.ok)throw new Error("The signup confirmation email could not be delivered.");
}
router.post("/auth/signup-requests", signupLimiter, async (req,res)=>{
  const parsed=SetupProfileBody.extend({ name:z.string().trim().min(1).max(100), username:z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/), password:z.string().min(10).max(128), email: z.string().trim().email().max(254) }).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:parsed.error.message});return;}
  const data:any=parsed.data, normalizedEmail=data.email.trim().toLowerCase(), username=data.username.trim().toLowerCase();
  if(data.password.length < 10 || !/[A-Za-z]/.test(data.password) || !/\d/.test(data.password)){res.status(400).json({error:"Use a password with at least 10 characters, including a letter and a number."});return;}
  const profiles=await getCollection(collections.profiles), requests=await getCollection(collections.signupRequests);
  await Promise.all([
    profiles.createIndex({ username: 1 }, { unique: true, name: "profile_username_unique" }),
    profiles.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } }, name: "profile_email_unique" }),
    requests.createIndex({ username: 1 }, { unique: true, partialFilterExpression: { status: "pending" }, name: "pending_username_unique" }),
    requests.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { status: "pending" }, name: "pending_email_unique" }),
    requests.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expired_signup_cleanup" }),
  ]);
  await requests.updateMany({status:"pending",expiresAt:{$lte:new Date()}},{$set:{status:"expired",passwordHash:null,emailVerificationTokenHash:null,approvalTokenHash:null,rejectionTokenHash:null,updatedAt:new Date()}});
  const genericResponse={message:"If the details can be registered, check your email for a confirmation link."};
  if(await profiles.findOne({$or:[{username},{email:normalizedEmail}]})){res.status(202).json(genericResponse);return;}
  if(await requests.findOne({status:"pending",$or:[{username},{email:normalizedEmail}]})){res.status(202).json(genericResponse);return;}
  const verifyToken=randomBytes(32).toString("base64url"), now=new Date();
  const request:any={id:await nextId(collections.signupRequests),name:data.name,username,email:normalizedEmail,passwordHash:await bcrypt.hash(data.password,12),occupation:data.occupation??null,jobStatus:data.jobStatus??null,incomeType:data.incomeType??null,country:data.country??null,state:data.state??null,currency:data.currency??"INR",currencySymbol:data.currencySymbol??"₹",theme:data.theme??"dark",weekStarts:data.weekStarts??"monday",salaryFrequency:data.salaryFrequency??null,status:"pending",emailVerified:false,emailVerificationTokenHash:hashApprovalToken(verifyToken),approvalTokenHash:null,rejectionTokenHash:null,expiresAt:new Date(now.getTime()+48*60*60_000),createdAt:now,updatedAt:now};
  try { await requests.insertOne(request); }
  catch(error:any) { if(error?.code===11000){res.status(202).json(genericResponse);return;} throw error; }
  try {
    const base=(process.env.APP_URL??"https://finance-intelli.vercel.app").replace(/\/$/,"");
    await sendVerificationEmail(normalizedEmail,data.name,`${base}/approval?decision=verify&token=${verifyToken}`);
  } catch (error) {
    await requests.deleteOne({id:request.id,status:"pending"});
    res.status(503).json({error:error instanceof Error?error.message:"Signup approval email could not be delivered."});return;
  }
  try { await writeAudit(req,"submit","signup-request",request.id,null,{username,email:normalizedEmail,status:"pending"}); } catch { /* Request and confirmation email are already safely recorded. */ }
  res.status(202).json({message:"Signup request submitted. The account will be created only after the owner approves it by email."});
});
router.post("/auth/signup-requests/verify/:token",signupLimiter,async(req,res)=>{
  const token=String(req.params.token??"");
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token)){res.status(400).json({error:"Invalid email confirmation link."});return;}
  const requests=await getCollection(collections.signupRequests), now=new Date(), hash=hashApprovalToken(token);
  const request:any=await requests.findOne({emailVerificationTokenHash:hash,status:"pending",emailVerified:false,expiresAt:{$gt:now}});
  if(!request){res.status(410).json({error:"This confirmation link has expired or has already been used."});return;}
  const processing=await requests.updateOne({id:request.id,status:"pending",emailVerified:false,emailVerificationTokenHash:hash},{$set:{emailVerified:"processing",updatedAt:now}});
  if(!processing.modifiedCount){res.status(410).json({error:"This confirmation link has already been used."});return;}
  const approveToken=randomBytes(32).toString("base64url"), rejectToken=randomBytes(32).toString("base64url");
  const base=(process.env.APP_URL??"https://finance-intelli.vercel.app").replace(/\/$/,"");
  try { await sendApprovalEmail(request,`${base}/approval?decision=approve&token=${approveToken}`,`${base}/approval?decision=reject&token=${rejectToken}`); }
  catch { await requests.updateOne({id:request.id,status:"pending",emailVerified:"processing"},{$set:{emailVerified:false,updatedAt:new Date()}});res.status(503).json({error:"The owner approval email could not be sent. Please try again later."});return; }
  const claimed=await requests.updateOne({id:request.id,status:"pending",emailVerified:"processing",emailVerificationTokenHash:hash},{$set:{emailVerified:true,emailVerificationTokenHash:null,approvalTokenHash:hashApprovalToken(approveToken),rejectionTokenHash:hashApprovalToken(rejectToken),updatedAt:now}});
  if(!claimed.modifiedCount){res.status(410).json({error:"This confirmation link has already been used."});return;}
  res.json({status:"verified",message:"Email confirmed. The owner has been sent your signup request for approval."});
});
router.post("/auth/signup-requests/:token/:decision",authLimiter,async(req,res)=>{
  const token=String(req.params.token??""), decision=String(req.params.decision);
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token)||!['approve','reject'].includes(decision)){res.status(400).json({error:"Invalid approval link."});return;}
  const requests=await getCollection(collections.signupRequests), key=decision==="approve"?"approvalTokenHash":"rejectionTokenHash", now=new Date();
  const request:any=await requests.findOne({[key]:hashApprovalToken(token),status:"pending",expiresAt:{$gt:now}});
  if(!request){res.status(410).json({error:"This approval link has expired or has already been used."});return;}
  if(decision==="reject"){
    await requests.updateOne({id:request.id,status:"pending"},{$set:{status:"rejected",passwordHash:null,emailVerificationTokenHash:null,approvalTokenHash:null,rejectionTokenHash:null,decidedAt:now,updatedAt:now}});
    try { await writeAudit(req,"reject","signup-request",request.id,null,{username:request.username,email:request.email}); } catch { /* Decision is already committed; don't make a consumed link appear to fail. */ }
    await sendApplicantEmail(request.email,"Finance Intelli signup request update","Your request was not approved","Your signup request was reviewed and was not approved. If you believe this was a mistake, contact the workspace owner.");
    res.json({status:"rejected",message:"Signup request rejected. Its stored password was erased."});return;
  }
  const profiles=await getCollection(collections.profiles);
  if(await profiles.findOne({$or:[{username:request.username},{email:request.email}]})){res.status(409).json({error:"That username or email is now in use. The request must be resubmitted with different details."});return;}
  const claimed=await requests.updateOne({id:request.id,status:"pending",[key]:hashApprovalToken(token),expiresAt:{$gt:now}},{$set:{status:"approved",emailVerificationTokenHash:null,approvalTokenHash:null,rejectionTokenHash:null,decidedAt:now,updatedAt:now}});
  if(!claimed.modifiedCount){res.status(410).json({error:"This approval link has already been used."});return;}
  const profile:any={id:await nextId(collections.profiles),username:request.username,passwordHash:request.passwordHash,name:request.name,email:request.email,occupation:request.occupation,jobStatus:request.jobStatus,incomeType:request.incomeType,country:request.country,state:request.state,currency:request.currency,currencySymbol:request.currencySymbol,theme:request.theme,weekStarts:request.weekStarts,salaryFrequency:request.salaryFrequency,timezone:"UTC",locale:"en-IN",photo:null,setupCompleted:true,failedLoginCount:0,lockedUntil:null,createdAt:now,updatedAt:now};
  try { await profiles.insertOne(profile); await ensureDefaultAccount(profile.id,profile.currency); }
  catch(error){await Promise.all([profiles.deleteOne({id:profile.id}), (await getCollection(collections.accounts)).deleteMany({profileId:profile.id})]);await requests.updateOne({id:request.id},{$set:{status:"failed",passwordHash:null,updatedAt:new Date()}});throw error;}
  await requests.updateOne({id:request.id},{$set:{passwordHash:null,updatedAt:new Date()}});
  try { await writeAudit(req,"approve","signup-request",request.id,null,{username:profile.username,email:profile.email,profileId:profile.id}); } catch { /* Account creation is committed; delivery/audit outages must not invalidate the approval. */ }
  try { await notifyUser(profile.id,"Your account is approved","Your Finance Intelli account is ready. Sign in to get started.","/command"); } catch { /* The confirmation email remains the delivery fallback. */ }
  await sendApplicantEmail(profile.email,"Your Finance Intelli account is ready","Your account is approved","Your account has been created. You can now sign in with your chosen username and password.");
  res.json({status:"approved",message:"The account has been created. The user can now sign in."});
});
router.post("/auth/login",authLimiter,async(req,res)=>{
  const parsed=LoginBody.safeParse(req.body);if(!parsed.success){res.status(400).json({error:parsed.error.message});return;} const profiles=await getCollection(collections.profiles);const profile:any=withoutMongoId(await profiles.findOne({username:parsed.data.username}));
  if(!profile||(profile.lockedUntil&&new Date(profile.lockedUntil)>new Date())){await bcrypt.compare(parsed.data.password,"$2b$12$wrr4AiR78lM1kfeBavt8EuMkFiwQfGgK5u8oNO9hFYRVohNrwlhpS");res.status(401).json({error:"Invalid username or password"});return;}
  if(!await bcrypt.compare(parsed.data.password,profile.passwordHash)){const failures=(profile.failedLoginCount??0)+1;await profiles.updateOne({id:profile.id},{$set:{failedLoginCount:failures,lockedUntil:failures>=5?new Date(Date.now()+Math.min(30,2**(failures-5))*60000):null,updatedAt:new Date()}});res.status(401).json({error:"Invalid username or password"});return;}
  await profiles.updateOne({id:profile.id},{$set:{failedLoginCount:0,lockedUntil:null,updatedAt:new Date()}});await issueSession(req,res,profile,parsed.data.rememberMe??true);await writeAudit(req,"login","session",null,null,{username:profile.username});res.json({token:"cookie-session",profile:profileResponse(profile)});
});
router.post("/auth/logout",async(req,res)=>{await revokeSession(req,res);res.json({message:"Logged out successfully"});});
router.post("/auth/refresh",async(req,res)=>{const payload=await rotateSession(req,res);if(!payload){res.status(401).json({error:"Session expired"});return;}res.json({ok:true});});
router.get("/auth/sessions",requireAuth,async(req,res)=>{const c=await getCollection(collections.sessions);const rows:any[]=withoutMongoIds(await c.find({profileId:req.user!.userId,revokedAt:null}).sort({createdAt:1}).toArray());res.json(rows.map(({tokenHash,...s})=>({...s,current:s.id===req.user!.sessionId})));});
router.delete("/auth/sessions/:id",requireAuth,async(req,res)=>{const c=await getCollection(collections.sessions);const session=await c.findOneAndUpdate({id:Number(req.params.id),profileId:req.user!.userId},{$set:{revokedAt:new Date(),updatedAt:new Date()}},{returnDocument:"after"});if(!session){res.status(404).json({error:"Session not found"});return;}await writeAudit(req,"revoke","session",Number(req.params.id));res.sendStatus(204);});
router.get("/auth/me",requireAuth,async(req,res)=>{const c=await getCollection(collections.profiles);const p=withoutMongoId(await c.findOne({id:req.user!.userId}));if(!p){res.status(401).json({error:"Profile not found"});return;}res.json(profileResponse(p));});
router.patch("/auth/profile",requireAuth,async(req,res)=>{const parsed=UpdateProfileBody.safeParse(req.body);if(!parsed.success){res.status(400).json({error:parsed.error.message});return;}const updates:any={updatedAt:new Date()};for(const k of ["name","occupation","jobStatus","incomeType","country","state","currency","currencySymbol","theme","weekStarts","salaryFrequency","photo"] as const)if(parsed.data[k]!=null)updates[k]=parsed.data[k];if(typeof req.body.timezone==="string"){try{Intl.DateTimeFormat(undefined,{timeZone:req.body.timezone});updates.timezone=req.body.timezone;}catch{res.status(400).json({error:"Invalid IANA time zone"});return;}}if(typeof req.body.locale==="string")updates.locale=req.body.locale.slice(0,20);const c=await getCollection(collections.profiles);const p=withoutMongoId(await c.findOneAndUpdate({id:req.user!.userId},{$set:updates},{returnDocument:"after"}));res.json(profileResponse(p));});
router.patch("/auth/password",authLimiter,requireAuth,async(req,res)=>{const parsed=ChangePasswordBody.safeParse(req.body);if(!parsed.success){res.status(400).json({error:parsed.error.message});return;}const profiles=await getCollection(collections.profiles);const p:any=withoutMongoId(await profiles.findOne({id:req.user!.userId}));if(!p||!await bcrypt.compare(parsed.data.currentPassword,p.passwordHash)){res.status(400).json({error:"Current password is incorrect"});return;}await profiles.updateOne({id:p.id},{$set:{passwordHash:await bcrypt.hash(parsed.data.newPassword,12),updatedAt:new Date()}});const sessions=await getCollection(collections.sessions);await sessions.updateMany({profileId:p.id},{$set:{revokedAt:new Date(),updatedAt:new Date()}});await issueSession(req,res,p,true);await writeAudit(req,"change_password","profile",p.id);res.json({message:"Password changed successfully"});});
export default router;
