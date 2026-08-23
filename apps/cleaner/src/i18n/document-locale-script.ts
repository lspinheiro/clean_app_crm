import { defaultLocale, localeCookieName, locales } from "./config";

/** Runs in <head> so the document language is correct before an unprefixed 404 paints. */
export function documentLocaleBootstrapScript() {
  return `(()=>{const locales=${JSON.stringify(locales)};const path=location.pathname;const route=locales.find((locale)=>path==="/"+locale||path.startsWith("/"+locale+"/"));const saved=document.cookie.split(";").map((part)=>part.trim()).find((part)=>part.startsWith(${JSON.stringify(`${localeCookieName}=`)}))?.split("=")[1];const cookie=locales.includes(saved)?saved:null;const languages=navigator.languages??[navigator.language];const device=languages.some((language)=>language.toLowerCase().startsWith("pt"))?"pt-BR":languages.some((language)=>language.toLowerCase().startsWith("en"))?"en-AU":${JSON.stringify(defaultLocale)};document.documentElement.lang=route??cookie??device})()`;
}
