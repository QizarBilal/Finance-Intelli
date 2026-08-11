import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { collections, getCollection, nextId, withoutMongoId, withoutMongoIds } from "@workspace/db";
import { issueSession, requireAuth, revokeSession, rotateSession } from "../middlewares/auth";
import { ensureDefaultAccount } from "../lib/accounts";
import { writeAudit } from "../lib/audit";
import { SetupProfileBody, LoginBody, UpdateProfileBody, ChangePasswordBody } from "@workspace/api-zod";

const router = Router();
const authLimiter = rateLimit({ windowMs: 900_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many authentication attempts. Please wait before retrying." } });
const profileResponse = (p: any) => ({ id:p.id,username:p.username,name:p.name,occupation:p.occupation,jobStatus:p.jobStatus,incomeType:p.incomeType,country:p.country,state:p.state,currency:p.currency,currencySymbol:p.currencySymbol,theme:p.theme,weekStarts:p.weekStarts,salaryFrequency:p.salaryFrequency,timezone:p.timezone,locale:p.locale,photo:p.photo,createdAt:new Date(p.createdAt).toISOString() });

router.get("/auth/check", async (_req,res)=>res.json({exists:true}));
router.post("/auth/setup", authLimiter, async (req,res)=>{
  const parsed=SetupProfileBody.safeParse(req.body); if(!parsed.success){res.status(400).json({error:parsed.error.message});return;}
  const profiles=await getCollection(collections.profiles); const data:any=parsed.data;
  if(await profiles.findOne({username:data.username})){res.status(409).json({error:"Username already taken. Please choose another."});return;}
  const now=new Date(); const profile:any={id:await nextId(collections.profiles),username:data.username,passwordHash:await bcrypt.hash(data.password,12),name:data.name,email:null,occupation:data.occupation??null,jobStatus:data.jobStatus??null,incomeType:data.incomeType??null,country:data.country??null,state:data.state??null,currency:data.currency??"INR",currencySymbol:data.currencySymbol??"₹",theme:data.theme??"dark",weekStarts:data.weekStarts??"monday",salaryFrequency:data.salaryFrequency??null,timezone:"UTC",locale:"en-IN",photo:null,setupCompleted:true,failedLoginCount:0,lockedUntil:null,createdAt:now,updatedAt:now};
  await profiles.insertOne(profile); await ensureDefaultAccount(profile.id,profile.currency); await issueSession(req,res,profile,true); res.status(201).json({token:"cookie-session",profile:profileResponse(profile)});
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
