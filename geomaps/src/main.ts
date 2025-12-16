import L from 'leaflet';
import $ from "jquery";
import { WarpedMapLayer } from '@allmaps/leaflet';
import './leaflet-slider.js';

import "bulma/css/versions/bulma-prefixed.css"
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import "./leaflet-slider.css";
import './style.css'

async function fetchRequest(url, options) {
    if (options == undefined) {
        options = {};
    }
    const response = await fetch(url, options);
    // Some IIIF manifests return 401 errors (Unauthorised) -- don't know why...
    if ([404,401].includes(response.status)) {
        throw new AbortError(response.statusText);
    }
    return response;
}

// needed to properly load the images in the Leaflet CSS
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// from https://switch2osm.org/using-tiles/getting-started-with-leaflet/
const map = L.map("map", {
    center: [-36.815, 144.965], 
    zoom: 7,
    zoomAnimationThreshold: 1
    });

// add the OpenStreetMap tiles
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
}).addTo(map);

async function getMapSearchData(lat, lng) {
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/georeferenced_maps/maps_from_point.json?longitude=${lng}&latitude=${lat}&distance=100000&_shape=array`;
    const response = await fetchRequest(url);
    const mapData = await response.json();
    console.log(mapData);
    displayResults(mapData);
}

async function removeWarpedMap(warpedMapLayer, allmapsId, item) {
    console.log("remove");
    //console.log(warpedMapLayer.getMapIds());
    console.log(allmapsId);
    //let removed = await warpedMapLayer.removeGeoreferenceAnnotationByUrl(allmapsId);
    map.removeLayer(warpedMapLayer)
    const idNum = allmapsId.split("/").pop();
    history.pushState(null, null, `${window.location.href.replace("&map_id=" + idNum, "")}`);
    console.log(warpedMapLayer.getMapIds());
    item.one("click", function() {
        $(this).toggleClass("map-selected");
        addWarpedMap(allmapsId, $(this));
    });
}

async function addWarpedMap(allmapsId, item, title) {
    console.log("add");
    console.log(allmapsId);
    //await warpedMapLayer.addGeoreferenceAnnotationByUrl(allmapsId)
    const response = await fetchRequest(allmapsId);
    const annotation = await response.json();
    const warpedMapLayer = await new WarpedMapLayer(annotation).addTo(mapLayer);
    warpedMapLayer.setOpacity(parseFloat(slider.value));
    warpedMapLayer.bindTooltip(title);
    const bounds = warpedMapLayer.getBounds();
    map.fitBounds(bounds, {padding: [25,25]});
    const idNum = allmapsId.split("/").pop();
    if (!window.location.href.includes(idNum)) {
        history.pushState(null, null, `${window.location.href}&map_id=${idNum}`);
    }
    console.log(mapIds);
    const idIndex = mapIds.indexOf(idNum);
    if (idIndex !== -1) {
        mapIds.splice(idIndex, 1);
    }
    console.log(mapIds);
    item.one("click", function() {
        $(this).toggleClass("map-selected");
        removeWarpedMap(warpedMapLayer, allmapsId, $(this));
    });
}

async function addResult(gmap, warp) {
    $("#info").show();
    let itemTemplate = `
        <article class="bulma-media bulma-pt-0 bulma-mt-0">
          <figure class="bulma-media-left">
            <p class="bulma-image bulma-is-128x128">
              <img loading="lazy" src="${gmap.image_id}/square/256,/0/default.jpg" />
            </p>
          </figure>
          <div class="bulma-media-content">
            <table class="bulma-table bulma-is-size-7 bulma-mt-0">
            <tr><th colspan=2>${gmap.title}</th></tr>
            <tr><th>Date</th><td>${gmap.date}</td></tr>
            <tr><th>Creator</th><td>${gmap.creator}</td></tr>
            <tr><th>Scale</th><td>${gmap.scale}</td></tr>
            <tr><th>Distance</th><td>${parseFloat((gmap.distance / 1000).toFixed(2))}km</td></tr>
            <tr><td colspan=2><a href="https://find.slv.vic.gov.au/discovery/fulldisplay?vid=61SLV_INST:SLV&docid=alma${gmap.alma_id}">Catalogue</a> &middot; <a href="https://viewer.slv.vic.gov.au/?entity=${gmap.ie_id}&mode=browse">Image viewer</a> &middot; <a href="https://viewer.allmaps.org/?url=${gmap.allmaps_map_id}">Allmaps viewer</a></td>
            </table>
          </div>
        </article>
    `
    let item = $(itemTemplate);
    $("#results").append(item);
    if (warp === true) {
        item.toggleClass("map-selected")
        addWarpedMap(gmap.allmaps_map_id, item, gmap.title);
    } else {
        item.one("click", function() {
            $(this).toggleClass("map-selected");
            addWarpedMap(gmap.allmaps_map_id, $(this), gmap.title)
        });
    }
}

async function displayResults(mapData) {
    for (let gmap of mapData.slice(0,50)) {
        addResult(gmap);
    }
}

async function getMapData(mapId, lat, lon) {
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/georeferenced_maps/maps_by_id.json?map_id=${mapId}&latitude=${lat}&longitude=${lon}&_shape=array`;
    const response = await fetchRequest(url);
    const mapData = await response.json();
    addResult(mapData[0], true);
}

function selectPoint(lat, lon) {
    mapLayer.clearLayers();
    map.removeControl(slider);
    slider.value = 1;
    map.addControl(slider);
    if (selectedPoint !== undefined) {
        map.removeLayer(selectedPoint);
    }
    $("#results").empty();
    selectedPoint = L.marker([lat, lon]).addTo(map);
    if (mapIds.length > 0) {
        for (let mapId of mapIds) {
            getMapData(mapId, lat, lon);
        }
    } else {
        getMapSearchData(lat, lon);
        history.pushState(null, null, `${window.location.href.split("?")[0]}?lat=${lat}&lon=${lon}`);
    }
}

map.on('click', function(ev) {
    selectPoint(ev.latlng.lat, ev.latlng.lng);
});

const mapLayer = L.layerGroup().addTo(map)
const slider = L.control.slider(function(value) {
        mapLayer.eachLayer(function (layer) {
            layer.setOpacity(parseFloat(value));
        });

    }, {id: "slider", position: "bottomleft", title: "Opacity", size: "200px", collapsed: false, max: 1, step: 0.1, value: 1, increment: true, syncSlider: true});
var selectedPoint;

const urlParams = new URLSearchParams(window.location.search);
var mapIds = urlParams.getAll("map_id");
let lat = urlParams.get("lat");
let lon = urlParams.get("lon");
if (lat && lon) {
    selectPoint(lat, lon);
}

//const warpedMapLayer = new WarpedMapLayer().addTo(map);
//if (allmapsId !== undefined) {
//    const warpedMapLayer = new WarpedMapLayer(allmapsId).addTo(geoMap);
//}
//const mapData = fetchRequest()