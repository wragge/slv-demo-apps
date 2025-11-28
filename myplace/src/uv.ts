import "bulma/css/versions/bulma-prefixed.css"
import './style.css'

import { init } from "universalviewer";
import "universalviewer/dist/esm/index.css";

const urlParams = new URLSearchParams(window.location.search);
const imageID = urlParams.get('image_id');

init("uv", {
  manifest: "https://wraggelabs.com/slv_iiif/" + imageID + "?group=True"
});
