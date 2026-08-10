import { describe, it, expect } from "vitest";
import { upsertSnapshot, sameSnapshot, filterByRange, monthChange, dayKey } from "@/lib/networth-history";
const s=(date:string,a:number,l:number)=>({date,assets:a,liabilities:l,net:a-l,base:"USD" as const});
describe("nw history",()=>{
 it("no duplicate day",()=>{
  let h:any[]=[]; h=upsertSnapshot(h,s("2026-08-10",100,0)); h=upsertSnapshot(h,s("2026-08-10",150,0));
  expect(h.length).toBe(1); expect(h[0].net).toBe(150);
 });
 it("same snapshot detection",()=>{ expect(sameSnapshot(s("2026-08-10",100,10),s("2026-08-10",100,10))).toBe(true); });
 it("month change",()=>{ const h=[s("2026-07-31",1000,0),s("2026-08-05",1100,0),s("2026-08-10",1184.2,0)];
  const m=monthChange(h); expect(Math.round(m.delta*10)/10).toBe(184.2); expect(Math.round(m.pct*10)/10).toBe(18.4); });
 it("range filter",()=>{ const today=dayKey(); const old=s("2020-01-01",1,0); const h=[old,s(today,2,0)];
  expect(filterByRange(h,"1M").length).toBe(1); expect(filterByRange(h,"ALL").length).toBe(2); });
 it("liability reduces net",()=>{ expect(s("2026-08-10",1000,300).net).toBe(700); });
});
