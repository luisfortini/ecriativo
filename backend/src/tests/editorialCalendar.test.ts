import assert from "node:assert/strict";
import { test } from "node:test";
import { anniversaryInWeek, localDate, validAnniversary, validTimeZone, weekStart } from "../services/editorialCalendar.js";
import { visualSelectionSchema, subjectSchema } from "../services/visualLibraryService.js";

test("aniversário e semana atravessam o ano sem perder a data",()=>{
  assert.equal(anniversaryInWeek("01-01","2026-12-28"),"2027-01-01");
  assert.equal(weekStart("2027-01-01"),"2026-12-28");
  assert.equal(anniversaryInWeek("02-29","2027-02-22"),"2027-02-28");
  assert.equal(anniversaryInWeek("02-29","2028-02-28"),"2028-02-29");
  assert.equal(validAnniversary("02-30"),false);
  assert.equal(validAnniversary("13-01"),false);
});
test("data local respeita meia-noite e rejeita fuso inválido",()=>{
  assert.equal(localDate(new Date("2026-09-29T01:00:00Z"),"America/Sao_Paulo"),"2026-09-28");
  assert.equal(validTimeZone("invalid-city"),false);
});
test("pessoas exigem autorização para aprovação e seleção não permite contradições",()=>{
  assert.equal(subjectSchema.safeParse({kind:"person",name:"Modelo",approved:true}).success,false);
  assert.equal(visualSelectionSchema.safeParse({people:"auto",no_people:true}).success,false);
});
