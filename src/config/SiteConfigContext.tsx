import { createContext, useContext } from "react";
import { siteConfig } from "./site";
export const SiteConfigContext = createContext(siteConfig);
export const useSiteConfig = () => useContext(SiteConfigContext);
