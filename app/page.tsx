import packageJson from "../package.json";
import { DividendSimulator } from "./simulator";

export default function Home() {
  return <DividendSimulator appVersion={packageJson.version} />;
}
