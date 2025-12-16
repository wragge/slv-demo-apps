import L from 'leaflet';
import 'leaflet-control-geocoder';
import $ from "jquery";
import pRetry, {AbortError} from 'p-retry';
import Wkt from 'wicket';
import { WarpedMapLayer } from '@allmaps/leaflet';
import { overpass } from "overpass-ts";

import "bulma/css/versions/bulma-prefixed.css"
import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import './style.css'

// BREAKPOINTS

let maxCellsDisplayed = 6;

const mobile = window.matchMedia('(max-width: 768px)');
const tablet = window.matchMedia('(min-width: 769px) and (max-width: 1023px)');
const desktop = window.matchMedia('(min-width: 1024px) and (max-width: 1215px)');
const widescreen = window.matchMedia('(min-width: 1216px)');

function handleScreenChange() {
    if (mobile.matches) {
        maxCellsDisplayed = 2;
    } else if (tablet.matches) {
        maxCellsDisplayed = 4;
    } else if (desktop.matches) {
        maxCellsDisplayed = 8;
    } else {
        maxCellsDisplayed = 12;
    } 
}

mobile.addListener(handleScreenChange);
tablet.addListener(handleScreenChange);
desktop.addListener(handleScreenChange);
widescreen.addListener(handleScreenChange);

// Initial check
handleScreenChange();


// MAP AND GEOCODER

// needed to properly load the images in the Leaflet CSS
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// from https://switch2osm.org/using-tiles/getting-started-with-leaflet/
var map = L.map("map").setView([-36.815, 144.965], 6);

// add the OpenStreetMap tiles
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
}).addTo(map);

// container for address search results
const addressSearchResults = new L.LayerGroup().addTo(map);

/*** Geocoder ***/
// OSM Geocoder
const geocoder = L.Control.Geocoder.nominatim({
    geocodingQueryParams: {
        countrycodes: 'au',
        polygon_geojson: 1
    }
})
const osmGeocoder = new L.Control.geocoder({
    geocoder: geocoder,
    collapsed: false,
    position: 'bottomleft',
    text: 'Address Search',
    placeholder: 'Enter an address or place name',
    defaultMarkGeocode: true
}).addTo(map);    

// handle geocoding result event
osmGeocoder.on('markgeocode', function (e) {
    console.log(e);
    clearAll();
    const query = e.sourceTarget._lastGeocode;
    addInfo(e.geocode, query);
    //getSuburbInfo(e.geocode);
    //getStreetInfo(e.geocode);
})

function clearAll() {
    $(".source-title").hide();
    $("#my-house").hide();
    $(".my-house-cua").hide();
    $(".my-house-sm").hide();
    $(".my-house-maps").hide();
    $(".my-house-parish-maps").hide();
    $(".my-house").empty();
    $("#my-street").hide();
    $(".my-street-cua").hide();
    $(".my-street-sm").hide();
    $(".my-street-maps").hide();
    $(".my-street-parish-maps").hide();
    $(".my-street").empty();
    $("#my-suburb").hide();
    $(".my-suburb-maps").hide();
    $(".my-suburb-parish-maps").hide();
    $(".my-suburb-newspapers").hide();
    $(".my-suburb").empty();
    $("#nearby").hide();
    $(".nearby-cua").hide();
    $(".nearby-maps").hide();
    $(".nearby-parish-maps").hide();
    $(".nearby-newspapers").hide();
    $(".nearby").empty();
    $(".bulma-button").remove();

}


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


// SLV DATA

async function getMarcRecord(almaId) {
    const url = "https://find.slv.vic.gov.au/primaws/rest/pub/sourceRecord?docId=alma" + almaId + "&vid=61SLV_INST:SLV";
    response = await fetchRequest(url, {});
    markData = await response.text;
    return marcData;
}

async function getIEid(almaId) {
    marcData = await getMarcRecord(almaId);
    matches = marcData.match(/\$e(IE\d+)/m);
    if (matches) {
        return matches[1];
    }
}

async function getIIIFManifest(ieId) {
    const url = "https://rosetta.slv.vic.gov.au/delivery/iiif/presentation/2.1/" + ieId + "/manifest.json";
    let response = await pRetry(() => fetchRequest(url, {}), {retries: 5, minTimeout: 1000, randomize: true});
    let manifest = await response.json();
    return manifest;
}

function getIdsFromManifest(manifest) {
    let imageIds = []
    for (let canvas of manifest.sequences[0].canvases) {
        if (canvas.images[0].resource.format == "image/jpeg") {
            imageIds.push(canvas.images[0].resource.service["@id"]);
        }
    }
    return imageIds;
}

async function getIIIFids(ieId) {
    let manifest = await getIIIFManifest(ieId);
    let imageIds = getIdsFromManifest(manifest);
    return imageIds;
}

async function searchCatalogue(placename) {
    // Doesn't work CORS error
    const url = "https://find.slv.vic.gov.au/primaws/rest/pub/pnxs?inst=61SLV_INST&limit=5&offset=0&q=sub,exact,%22" + placename + "+(Vic.)%22&qInclude=facet_rtype,exact,images%7C,%7Cfacet_tlevel,exact,online_resources&scope=slv_local&vid=61SLV_INST:SLV";
    let items = [];
    response = await fetchRequest(url, {});
    searchData = await response.json();
    for (let item of data.docs) {
        let almaId = item.pnx.control.sourcerecordid[0];
        let title = item.pnx.display.title;
        let date = item.pnx.display.creationdate;
        items.push({"alma_id": almaId, "title": title, "date": date})
    }
    return items;
}

// LAYOUT

function hideCells(gridId, maxNum, colour, buttonText, buttonClass) {
    if (($(`#${gridId}-grid`).next("a.bulma-button.hide").length == 0) || (buttonClass !== undefined)) {
        if (buttonClass && buttonClass.includes("bulma-button hide")) {
            $(`#${gridId}-grid .bulma-cell`).slice(maxCellsDisplayed,).slideUp();
        } else {
            $(`#${gridId}-grid .bulma-cell`).slice(maxCellsDisplayed,).hide();
        }
        $(`#${gridId}-grid`).next("a.bulma-button.hide").remove();
        if (($(`#${gridId}-grid`).next("a.bulma-button").length == 0) && ($(`#${gridId}-grid .bulma-cell`).length > maxCellsDisplayed)) {
            let button = $(`<a class="bulma-block bulma-button show bulma-mt-0 bulma-has-background-${colour} bulma-has-text-${colour}-invert">Show more ${buttonText} ⯆</a>`);
            button.on("click", () => showCells(gridId, maxNum, colour, buttonText));
            $(`#${gridId}-grid`).after(button);
            $(`#${gridId}`).append(button);
        }
    }
}

function showCells(gridId, maxNum, colour, buttonText) {
    $(`#${gridId}-grid .bulma-cell`).slideDown();
    $(`#${gridId}-grid`).next("a.bulma-button").remove();
    let button = $(`<a class="bulma-button bulma-block hide bulma-mt-0 bulma-has-background-${colour} bulma-has-text-${colour}-invert">Show less ${buttonText} ⯅</a>`);
    button.on("click", function() { 
        hideCells(gridId, maxNum, colour, buttonText, $(this).attr("class"))
    });
    $(`#${gridId}-grid`).after(button);
}

async function addInfo(geocode, query) {
    const osmId = geocode.properties.osm_id;
    const osmType = geocode.properties.osm_type.slice(0,1).toUpperCase();
    history.pushState(null, null, `${window.location.href.split("?")[0]}?osm_id=${osmType}${osmId}`);
    addAddressInfo(geocode, query);
    addSuburbInfo(geocode);
}


function findPlaceType(address) {
    for (let placeType of ["suburb", "city_district", "town", "village", "hamlet", "city", "locality", "borough", "neighbourhood", "county", "municipality"]) {
        if(placeType in address) {
            return placeType;
        }
    }
}

function makeCard(header, colour, image, map, content, footer, cellId, cellClass) {
    let cell = $(`<div id="${cellId}" class="bulma-cell bulma-is-colspan-1 ${cellClass}"></div>`);
    let card = $('<div class="bulma-card"></div>');
    if (header) {
        card.append($(`<header class="bulma-card-header bulma-has-background-${colour}"></header>`).html(`<p class="bulma-card-header-title bulma-has-text-${colour}-invert">${header}</p>`));
    }
    if (image) {
        card.append($('<div class="bulma-card-image"></div>').append(image));
    }
    if (map) {
        card.append($('<div class="bulma-card-image"></div>').append(map));
    }
    if (content) {
        card.append($('<div class="bulma-card-content"></div>').html('<div class="content">' + content + '</div>'));
    }
    if (footer) {
        card.append(footer);
    }
    return cell.append(card);
}

function makeFooter(links) {
    let footer = $('<footer class="bulma-card-footer"></footer');
    for (let link of links) {
        footer.append(link)
    }
    return footer;
}

// SUBURB INFO

async function displaySuburbMap(suburbData) {
    let content = '<table class="bulma-table bulma-is-size-7">';
    content += `<tr><th colspan="2">${suburbData["name"]}</th></tr>`;
    if ("municipality" in suburbData.address) {
        content += '<tr><th>Municipality</th><td>' + suburbData.address.municipality + '</td></tr>';
    }
    if ("postcode" in suburbData.address) {
        content += '<tr><th>Postcode</th><td>' + suburbData.address.postcode + '</td></tr>';
    }
    content += '</table>';
    let mapCard = makeCard("OpenStreetMap", "link-30", null, $('<div id="suburb-map" class="uv-thumb">'), content);
    $("#my-suburb").show();
    $(".my-suburb").show();
    $("#my-suburb-info-grid").prepend(mapCard);
    var suburbMap = L.map("suburb-map").setView({ lon: 0, lat: 0 }, 2);
    // add the OpenStreetMap tiles
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(suburbMap);
    let geojson_layer = L.geoJSON(suburbData.geojson).addTo(suburbMap);
    suburbMap.fitBounds(geojson_layer.getBounds());
}

async function getWikidata(osmId) {
    console.log(osmId);
    const sparqlQuery = `SELECT ?item ?itemLabel where {
          ?item wdt:P402 "${osmId}".
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }`;
    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparqlQuery);
    const options = {headers: {'Accept': 'application/sparql-results+json' }};
    let response = await fetchRequest(url, options);
    let queryData = await response.json();
    console.log(queryData);
}

// SUBURB IMAGES

async function displayImage(imageData) {
    try {
        //const iiifIds = await getIIIFids(imageData.ie_id);
        //console.log(iiifIds);
        let imageId = imageData.image_id.split("|")[0];
        let image = $('<img loading="lazy"/>').attr("src", `${imageId}/full/800,/0/default.jpg`);
        let content = '<table class="bulma-table  bulma-is-size-7">';
        content += `<tr><th colspan="2">${imageData.title}</th></tr>`;
        let dates;
        if (imageData.end_year != imageData.start_year) {
            dates = `between ${imageData.start_year} and ${imageData.end_year}`
        } else {
            dates = imageData.start_year;
        }
        content += `<tr><th>Date</th><td>${dates}</td></tr>`;
        content += '</table>';
        let links = [
            $(`<a href="https://find.slv.vic.gov.au/discovery/fulldisplay?vid=61SLV_INST:SLV&docid=alma${imageData.alma_id}" class="bulma-card-footer-item">Catalogue</a>`),
            $(`<a href="https://viewer.slv.vic.gov.au/?entity=${imageData.ie_id}&mode=browse" class="bulma-card-footer-item">Image viewer</a>`),
        ]
        let imageCard = makeCard("SLV collection image", "warning-30", image, null, content, makeFooter(links));
        $("#my-suburb").show();
        $(".my-suburb").show();
        $("#my-suburb-info-grid").append(imageCard);
        hideCells("my-suburb-info", 6, "warning-30", "images");
    } catch (error) {
        console.log(error);
    }
}

async function displaySuburbImages(suburb, number) {
    const response = await fetch("/place_images.json");
    const imageData = await response.json();
    if (suburb in imageData) {
        let images = imageData[suburb];
        // Random sort
        images.sort(() => 0.5 - Math.random())[0];
        //let selection = images.slice(0, number)
        //console.log(selection);
        for (let imageData of images) {
            displayImage(imageData);
        }
    }
}

// SANDS AND MAC

async function displaySandsMac(entry, year, houseNumber) {
    const cellId = `sm-${year}-${entry.page}-${entry.line}`;
    let buffer = 100;
    let x = (entry.x - buffer) < 0 ? 0 : (entry.x - buffer);
    let y = (entry.y - buffer) < 0 ? 0 : (entry.y - buffer);
    let h = entry.h + (buffer * 2);
    let w = entry.w + (buffer * 2);
    let imageUrl = `https://rosetta.slv.vic.gov.au/iiif/2/${entry.vol_id}:${entry.page_id}.tif/${x},${y},${w},${h}/max/0/default.jpg`;
    let image = $('<img loading="lazy"/>').attr("src", imageUrl);
    let content = '<table class="bulma-table bulma-is-size-7">';
    content += `<tr><th>Text</th><td>${entry.text}</td>`;
    content += `<tr><th>Year</th><td>${year}</td>`;
    content += `<tr><th>Page</th><td>${entry.page}</td>`;
    content += "</table>";
    let link = $(`<a class="bulma-card-footer-item" href="https://sands-mcdougalls-directories-481615284700.australia-southeast1.run.app/sands-mcdougalls-directories-victoria/v${year}/${entry.page},${entry.line}">View</a>`);
    let entryCard = makeCard("Sands & MacDougall's", "primary-30", image, null, content, makeFooter([link]), cellId, null);
    if (houseNumber) {
        $("#my-house").show();
        $(".my-house").show();
        $("#my-house-sm-grid").append(entryCard);
        hideCells("my-house-sm", 12, "primary-30", "Sands & Mac");
    } else {
        $("#my-street").show();
        $(".my-street").show();
        $("#my-street-sm-grid").append(entryCard);
        hideCells("my-street-sm", 12, "primary-30", "Sands & Mac");
    }

}

async function getSandsMacAbbrevs(suburb) {
    const url = `https://sands-mcdougalls-directories-481615284700.australia-southeast1.run.app/sands-mcdougalls-directories-victoria/abbreviations.json?_sort=rowid&suburb__exact=${suburb}&_shape=array`;
    const response = await fetchRequest(url, {});
    const data = await response.json();
    let abbrevs = [];
    for (let item of data) {
        if (!abbrevs.includes(item.abbr)) {
            abbrevs.push(item.abbr);
        }
    }
    return abbrevs;
}

async function getSandsMacYear(houseNumber, street, suburb, year) {
    const streetAbbrs = {
        "Alley": "al",
        "Avenue": "av",
        "Boulevard": "blvrd",
        "Court": "crt",
        "Crescent": "cres",
        "Drive": "drv",
        "Estate": "est",
        "Grove": "gro",
        "Highway": "hgwy",
        "Lane": "la",
        "Little": "Lt",
        "Parade": "par",
        "Park": "pk",
        "Promenade": "prom",
        "Reserve": "res",
        "Road": "rd",
        "Street": "st"
    }
    for (let [key, value] of Object.entries(streetAbbrs)) {
        //const pattern = new RegExp(`\b${key}\b`);
        street = street.replace(key, value);
    }
    let abbrevs = await getSandsMacAbbrevs(suburb);
    abbrevs.push(suburb);
    let addresses = [];
    for (let abbr of abbrevs) {
        addresses.push([houseNumber, street, abbr].join(" ").trim());
    }
    
    let query = encodeURIComponent(`"${addresses.join('" OR "')}"`);
    //console.log(query);
    const url = `https://sands-mcdougalls-directories-481615284700.australia-southeast1.run.app/sands-mcdougalls-directories-victoria.json?sql=select+v${year}.*%2C+pages.vol_id+from+v${year}+join+pages+on+v${year}.page_id+%3D+pages.page_id+where+v${year}.rowid+in+(select+v${year}_fts.rowid+from+v${year}_fts+where+v${year}_fts+match+%3Asearch)+limit+5&search=${query}&_shape=array`;
    //console.log(url);
    const smResponse = await fetchRequest(url, {});
    const entryData = await smResponse.json();
    //console.log(entryData);
    for (let entry of entryData) {
        displaySandsMac(entry, year, houseNumber);
    }
}

async function getSandsMac(houseNumber, street, suburb) {
    const years = [1860, 1865, 1870, 1875, 1880, 1895, 1900, 1905, 1910, 1920, 1925, 1930, 1935, 1940, 1945, 1950, 1955, 1960, 1965, 1970, 1974];
    for (let year of years) {
        //console.log(year);
        await getSandsMacYear(houseNumber, street, suburb, year);
    }
}

// NEWSPAPERS

async function displayNewspaper(newspaper, section) {
    let content = '<table class="bulma-table bulma-is-size-7">';
    content += `<tr><th colspan="2" >${newspaper.title}</th>`;
    if (newspaper.date) {
        content += `<tr><th>Dates</th><td>${newspaper.date}</td>`;
    }
    if (newspaper.publisher) {
        content += `<tr><th>Publisher</th><td>${newspaper.publisher}</td>`;
    }
    if (newspaper.placename) {
        content += `<tr><th>Place</th><td>${newspaper.placename}</td>`;
    }
    if (newspaper.distance) {
        content += `<tr><th>Distance</th><td>${parseFloat((newspaper.distance / 1000).toFixed(2))}km</td>`;
    }
    content += "</table>";
    let links = [];
    if (newspaper.alma_id) {
        links.push($(`<a href="https://find.slv.vic.gov.au/discovery/fulldisplay?vid=61SLV_INST:SLV&docid=alma${newspaper.alma_id}" class="bulma-card-footer-item">Catalogue</a>`));
    }
    if (newspaper.trove_url) {
        links.push($(`<a href="${newspaper.trove_url}" class="bulma-card-footer-item">Trove</a>`));
    }
    let newspaperCard = makeCard("newspaper", "info-30", null, null, content, makeFooter([links]));
    $(`#${section}`).show();
    $(`#${section}-hero`).show();
    $(`.${section}-newspapers`).show();
    $(`#${section}-newspapers-grid`).append(newspaperCard);
    hideCells(`${section}-newspapers`, 12, "info-30", "newspapers");
}

async function getNewspapers(suburb) {
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/newspapers/titles_by_place.json?placename=${suburb}&_shape=array`;
    const response = await fetchRequest(url, {});
    const newspapers = await response.json();
    for (let newspaper of newspapers) {
        displayNewspaper(newspaper, "my-suburb");
    }
}

async function getNearbyNewspapers(latitude, longitude, suburb) {
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/newspapers/titles_from_point_exclude_place.json?longitude=${longitude}&latitude=${latitude}&distance=100000&placename=${suburb}&_shape=array`;
    console.log(url);
    const response = await fetchRequest(url, {});
    const newspapers = await response.json();
    for (let newspaper of newspapers.slice(0,24)) {
        displayNewspaper(newspaper, "nearby");
    }
}

// GEOREFERENCED MAPS

async function displayMap(map, addressType, point, warp) {
    //console.log(addressType);
    let content = '<table class="bulma-table bulma-is-size-7">';
    content += `<tr><th colspan="2" >${map.title}</th>`;
    if (map.date) {
        content += `<tr><th>Date</th><td>${map.date}</td>`;
    }
    if (map.creator) {
        content += `<tr><th>Creator</th><td>${map.creator}</td>`;
    }
    if (map.distance > 0) {
        content += `<tr><th>Distance</th><td>${parseFloat((map.distance / 1000).toFixed(2))}km</td>`;
    }
    content += "</table>";
    let imageUrl = `${map.image_id}/full/800,/0/default.jpg`;
    let image = $('<img loading="lazy"/>').attr("src", imageUrl);
    let links = [
        //`<a class="bulma-card-footer-item" href="https://find.slv.vic.gov.au/discovery/fulldisplay?vid=61SLV_INST:SLV&docid=alma${map.alma_id}">Catalogue</a>`, 
        `<a class="bulma-card-footer-item" href="https://viewer.slv.vic.gov.au/?entity=${map.ie_id}&mode=browse">Image viewer</a>`, 
        `<a class="bulma-card-footer-item" href="https://viewer.allmaps.org/?url=${map.allmaps_map_id}">Allmaps viewer</a>`
    ]
    let map_id = `${map.ie_id}-${map.fl_id}-map`;
    let mapCard;
    if ((addressType == "house") && (warp === true)) {
        mapCard = makeCard("georeferenced map", "danger-30", null, $(`<div id="${map_id}" class="map-thumb">`), content, makeFooter(links));
    } else {
        mapCard = makeCard("georeferenced map", "danger-30", image, null, content, makeFooter(links));
    }
    //console.log(map.distance);
    if (map.distance > 0) {
        $("#nearby").show();
        $("#nearby-hero").show();
        $(".nearby-maps").show();
        $("#nearby-maps-grid").append(mapCard);
        hideCells("nearby-maps", 6, "danger-30", "georeferenced maps");
    } else if (addressType == "street") {
        $("#my-street").show();
        $("#my-street-hero").show();
        $(".my-street-maps").show();
        $("#my-street-maps-grid").append(mapCard);
        hideCells("my-street-maps", 6, "danger-30", "georeferenced maps");
    } else if (addressType == "house") {
        $("#my-house").show();
        $("#my-house-hero").show();
        $(".my-house-maps").show();
        $("#my-house-maps-grid").append(mapCard);
        hideCells("my-house-maps", 6, "danger-30", "georeferenced maps");
        if (warp === true) {
            let geoMap = L.map(map_id, {center: point, zoom: 16, zoomAnimationThreshold: 1});
            // add the OpenStreetMap tiles
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution:
                '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
            }).addTo(geoMap);
            const warpedMapLayer = new WarpedMapLayer(map.allmaps_map_id).addTo(geoMap);
            //console.log(warpedMapLayer.getBounds());
            L.marker(point).addTo(geoMap);
            //geoMap.fitBounds(warpedMapLayer.getBounds());
        }
    } else {
        $("#my-suburb").show();
        $("#my-suburb-hero").show();
        $(".my-suburb-maps").show();
        $("#my-suburb-maps-grid").append(mapCard);
        hideCells("my-suburb-maps", 6, "danger-30", "georeferenced maps");
    }
    
}

async function getMaps(geoProps, addressType) {
    //console.log(geoProps);
    let wkt = new Wkt.Wkt();
    wkt.read(JSON.stringify(geoProps.geojson));
    //console.log(wkt.write());
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/georeferenced_maps/maps_from_wkt.json?wkt=${encodeURIComponent(wkt.write())}&distance=10000&_shape=array`;
    let response = await fetchRequest(url, {});
    let mapData = await response.json();
    let homeMaps = mapData.filter((m) => m.distance == 0);
    let nearMaps = mapData.filter((m) => m.distance > 0);
    let index = 1
    for (let map of homeMaps) {
        let warp = (index <= 6) ? true : false;
        displayMap(map, addressType, [parseFloat(geoProps.lat), parseFloat(geoProps.lon)], warp);
        index += 1
    }
    for (let map of nearMaps.slice(0,24)) {
        displayMap(map, addressType, [parseFloat(geoProps.lat), parseFloat(geoProps.lon)], false);
    }
} 

// PARISH MAPS

async function displayParishMap(map, addressType, point) {
    //console.log(addressType);
    let content = '<table class="bulma-table bulma-is-size-7">';
    content += `<tr><th colspan="2" >${map.title}</th>`;
    if (map.date) {
        content += `<tr><th>Date</th><td>${map.date}</td>`;
    }
    if (map.creator) {
        content += `<tr><th>Publisher</th><td>${map.publisher}</td>`;
    }
    if (map.description) {
        content += `<tr><th>Description</th><td>${map.description}</td>`;
    }
    if (map.scale) {
        content += `<tr><th>Scale</th><td>${map.scale}</td>`;
    }
    if (map.distance > 0) {
        content += `<tr><th>Distance</th><td>${parseFloat((map.distance / 1000).toFixed(2))}km</td>`;
    }
    content += "</table>";
    let imageIds = map.iiif_ids || "";
    let imageId = imageIds.split("|")[0]
    let links = [
        `<a class="bulma-card-footer-item" href="https://find.slv.vic.gov.au/discovery/fulldisplay?vid=61SLV_INST:SLV&docid=alma${map.alma_id}">Catalogue</a>`, 
        //`<a class="bulma-card-footer-item" href="https://viewer.slv.vic.gov.au/?entity=${map.ie_id}&mode=browse">Image viewer</a>`, 
    ]
    if (map.image_id) {
        links.push(`<a class="bulma-card-footer-item" href="https://viewer.slv.vic.gov.au/?entity=${map.image_id}&mode=browse">Image viewer</a>`);
    }
    let map_id = `${map.image_id}-map`;
    let mapCard;
    if (imageId) {
        let imageUrl = `${imageId}/full/800,/0/default.jpg`;
        let image = $('<img loading="lazy"/>').attr("src", imageUrl);
        mapCard = makeCard("parish map", "danger-15", image, null, content, makeFooter(links));
    } else {
        mapCard = makeCard("parish map", "danger-15", null, null, content, makeFooter(links));
    }
    //console.log(map.distance);
    if (map.distance > 0) {
        $("#nearby").show();
        $("#nearby-hero").show();
        $(".nearby-parish-maps").show();
        $("#nearby-parish-maps-grid").append(mapCard);
        hideCells("nearby-parish-maps", 6, "danger-15", "parish maps");
    } else if (addressType == "street") {
        $("#my-street").show();
        $("#my-street-hero").show();
        //$(".my-street-maps").show();
        $("#my-street-parish-maps-grid").append(mapCard);
        hideCells("my-street-parish-maps", 6, "danger-15", "parish maps");
    } else if (addressType == "house") {
        $("#my-house").show();
        $("#my-house-hero").show();
        //$(".my-house-maps").show();
        $("#my-house-parish-maps-grid").append(mapCard);
        hideCells("my-house-parish-maps", 6, "danger-15", "parish maps");
    } else {
        $("#my-suburb").show();
        $("#my-suburb-hero").show();
        //$(".my-suburb-maps").show();
        $("#my-suburb-parish-maps-grid").append(mapCard);
        hideCells("my-suburb-parish-maps", 6, "danger-15", "parish maps");
    }
    
}

async function getParishMaps(geoProps, addressType) {
    //console.log(geoProps);
    let wkt = new Wkt.Wkt();
    wkt.read(JSON.stringify(geoProps.geojson));
    //console.log(wkt.write());
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/parish_maps/maps_from_wkt.json?wkt=${encodeURIComponent(wkt.write())}&distance=10000&_shape=array`;
    let response = await fetchRequest(url, {});
    let mapData = await response.json();
    console.log(mapData);
    let homeMaps = mapData.filter((m) => m.distance == 0);
    let nearMaps = mapData.filter((m) => m.distance > 0);
    let index = 1
    for (let map of homeMaps) {
        displayParishMap(map, addressType, [parseFloat(geoProps.lat), parseFloat(geoProps.lon)]);
        index += 1
    }
    for (let map of nearMaps.slice(0,24)) {
        displayParishMap(map, addressType, [parseFloat(geoProps.lat), parseFloat(geoProps.lon)]);
    }
} 

// CUA

async function displayCUAGroup(cuaGroup, gridId) { 
    let imageIds = cuaGroup.image_ids.split(",");
    let numImages = imageIds.length;
    let content = '<table class="bulma-table bulma-is-size-7">';
    content += `<tr><th colspan="2" >${cuaGroup.title}</th>`;
    content += `<tr><th>Number of images</th><td>${numImages}</td>`;
    if (cuaGroup.distance > 0) {
        content += `<tr><th>Distance</th><td>${parseFloat((cuaGroup.distance / 1000).toFixed(2))}km</td>`;
    }
    content += "</table>";
    let imageId = imageIds.sort(() => 0.5 - Math.random())[0];
    //const manifestUrl = `https://wraggelabs.com/slv_iiif/${ieId}`;
    //const manifestResponse = await fetchRequest(manifestUrl, {});
    //const manifest = await manifestResponse.json();
    //let imageId = getIdsFromManifest(manifest)[0];
    let imageUrl = `${imageId}/full/800,/0/default.jpg`;
    let image = $('<img loading="lazy"/>').attr("src", imageUrl);
    let links = [`<a class="bulma-card-footer-item" href="https://slv.wraggelabs.com/cua/?road=${cuaGroup.road}">CUA browser</a>`, `<a class="bulma-card-footer-item" href="https://viewer.slv.vic.gov.au/?entity=${cuaGroup.ie_ids.split(",")[0]}&mode=browse">Image viewer</a>`]
    let cuaCard = makeCard("Committee for Urban Action", "success-30", image, null, content, makeFooter(links));
    $(`#${gridId}`).show();
    $(`#${gridId}-hero`).show();
    $(`.${gridId}-cua`).show();
    $(`#${gridId}-cua-grid`).append(cuaCard);
    hideCells(`${gridId}-cua`, 6, "success-30", "CUA photos");
}


async function displayCUA(cuaGroup) {
    //let imageId = cuaGroup.image_id.split("|")[0];
    //const manifestUrl = `https://wraggelabs.com/slv_iiif/${ieId}?group=true`;
    //const manifestResponse = await fetchRequest(manifestUrl, {});
    //const manifest = await manifestResponse.json();
    //cuaGroup["imageIds"] = getIdsFromManifest(manifest);
    for (let cuaImage of cuaGroup.image_ids.split(",")) {
        let content = '<table class="bulma-table bulma-is-size-7">';
        content += `<tr><th colspan="2" >${cuaGroup.title}</th>`;
        if (cuaGroup.distance > 0) {
            content += `<tr><th>Distance</th><td>${parseFloat((cuaGroup.distance / 1000).toFixed(2))}km</td>`;
        }
        content += "</table>";

        let imageUrl = `${cuaImage}/full/800,/0/default.jpg`;
        let image = $('<img loading="lazy"/>').attr("src", imageUrl);
        let ieId = cuaImage.match(/IE\d+/)[0];
        let links = [`<a class="bulma-card-footer-item" href="https://slv.wraggelabs.com/cua/?road=${cuaGroup.road}">CUA browser</a>`, `<a class="bulma-card-footer-item" href="https://viewer.slv.vic.gov.au/?entity=${ieId}&mode=browse">Image viewer</a>`]
        let cuaCard = makeCard("Committee for Urban Action", "success-30", image, null, content, makeFooter(links));
        $("#my-street").show();
        $("#my-street-hero").show();
        $(".my-street-cua").show();
        $("#my-street-cua-grid").append(cuaCard);
        hideCells("my-street-cua", 6, "success-30", "CUA photos");
    }
}

// From https://dev.to/askyt/check-if-array-contains-any-element-of-another-array-in-js-583i
function containsAny(arr1, arr2) {
    return arr1.some(item => arr2.includes(item));
}

async function getCUANearby(ways,latitude, longitude) {
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/cua/photo_groups_from_point.json?longitude=${longitude}&latitude=${latitude}&distance=5000&limit=${18 + ways.length}&_shape=array`;
    let response = await fetchRequest(url, {});
    let cuaData = await response.json();
    let newGroups = cuaData.filter((c) => containsAny(ways, JSON.parse(c.ways)) ? false : true)
    for (let cuaGroup of newGroups.slice(0, 12)) {
        //let ieId = cuaGroup.ie_ids.split(",")[0];
        //const manifestUrl = `https://wraggelabs.com/slv_iiif/${ieId}?group=true`;
        //const manifestResponse = await fetchRequest(manifestUrl, {});
        //const manifest = await manifestResponse.json();
        //cuaGroup["imageIds"] = getIdsFromManifest(manifest);
        displayCUAGroup(cuaGroup, "nearby");
    }
}

async function getCUAWays(ways, addressType) {
    console.log(ways);
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/cua/photo_groups_from_way_ids.json?way_ids=${JSON.stringify(ways)}&_shape=array`;
    let response = await fetchRequest(url, {});
    let cuaData = await response.json();
    console.log(cuaData);
    for (let cuaGroup of cuaData) {
        //let ieId = cuaGroup.ie_ids.split(",")[0];
        //const manifestUrl = `https://wraggelabs.com/slv_iiif/${ieId}?group=true`;
        //const manifestResponse = await fetchRequest(manifestUrl, {});
        //const manifest = await manifestResponse.json();
        //cuaGroup["imageIds"] = getIdsFromManifest(manifest);
        // If it's a house we'll show all the individual photos from the nearest road segments
        if (addressType == "house") {
            displayCUA(cuaGroup);
        // If it's a street we'll show the groups for the current way
        } else {
            displayCUAGroup(cuaGroup, "my-street");
        }
    }
}

async function getStreetInfo(latitude, longitude, street, suburb) {
    const url = `https://nominatim.openstreetmap.org/search?street=${street}&city=${suburb}&state=Victoria&format=json&dedupe=0&polygon_geojson=1`;
    let response = await fetchRequest(url, {});
    let streetData = await response.json();
    let ways = [];
    for (let str of streetData) {
        ways.push(str.osm_id);
    }
    getCUAWays(ways, "street");
    getCUANearby(ways,latitude, longitude);
}

async function getStreetSegments(latitude, longitude, street, suburb) {
    const query = `[out:json];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|service|track|pedestrian|living_street)$"][name="${street}"](around:20,${latitude},${longitude});out body;`;
    const response = await(overpass(query, {rateLimitRetries: 5}));
    const wayData = await response.json();
    let ways = [];
    for (let way of wayData["elements"]) {
        ways.push(way.id);
    }
    getCUAWays(ways, "house");
    getCUANearby(ways,latitude, longitude);
}

// SUBURB

async function getSuburbInfo(geocode, suburb) {
    const url = "https://nominatim.openstreetmap.org/search?city=" + suburb + "&state=Victoria&limit=5&format=json&addressdetails=1&polygon_geojson=1";
    let response = await fetchRequest(url, {});
    let suburbData = await response.json();
    //console.log(suburbData);
    displaySuburbMap(suburbData[0]);
    getWikidata(suburbData[0]["osm_id"]);
}

async function addSuburbInfo(geocode) {
    const placeType = findPlaceType(geocode.properties.address);
    console.log(placeType);
    $("#my-suburb-hero h2").html("my " + placeType);
    const suburb = geocode.properties.address[placeType]
    //console.log(suburb);
    if (placeType != geocode.properties.addresstype) {
        getSuburbInfo(geocode, suburb);
    } else {
        //let wkt = new Wkt.Wkt();
        //wkt.read(JSON.stringify(suburbData[0].geojson));
        //console.log(wkt.write());
        displaySuburbMap(geocode.properties);
        getWikidata(geocode.properties["osm_id"]);
        getMaps(geocode.properties, placeType);
        getParishMaps(geocode.properties, placeType);
    }
    displaySuburbImages(suburb, 6);
    getNewspapers(suburb);
    getNearbyNewspapers(geocode.properties.lat, geocode.properties.lon, suburb);
}

// ADDRESS

async function addAddressInfo(geocode, query) {
    let addressType;
    let houseNumber = geocode.properties.address.house_number || "";
    let street = geocode.properties.address.road || "";
    let suburb = geocode.properties.address.suburb || "";
    // Needed for maps
    if (houseNumber) {
        addressType = "house";
    } else if (street) {
        addressType = "street";
    }
    // Try to get house number from query for S&M
    if (houseNumber == "" && query !== undefined) {
        let matches = query.match(/^\d+/)
        if (matches) {
            houseNumber = matches[0];
        }
    }
    if (addressType !== undefined) {
        //$("#my-address-container").prepend($('<h2 id="address-title" class="bulma-title bulma-is-size-2 bulma-has-text-weight-light">').html("my " + addressType));
        getSandsMac(houseNumber, street, suburb);
        getMaps(geocode.properties, addressType);
        getParishMaps(geocode.properties, addressType);
        if (addressType == "house") {
            getStreetSegments(geocode.properties.lat, geocode.properties.lon, street, suburb);
        } else {
            getStreetInfo(geocode.properties.lat, geocode.properties.lon, street, suburb);
        }
    } else {
        getCUANearby([],geocode.properties.lat, geocode.properties.lon);
    }

}

const urlParams = new URLSearchParams(window.location.search);
const osmId = urlParams.get('osm_id');
if (osmId) {
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmId}&format=json&addressdetails=1&polygon_geojson=1`;
    const response = await fetchRequest(url, {});
    let nomData = await response.json();
    console.log(nomData);
    let marker = L.marker([nomData[0].lat, nomData[0].lon]).addTo(map);
    osmGeocoder.setQuery(nomData[0].display_name);
    addInfo({"properties": nomData[0]});
}

// Kick start the dbs if they're asleep
fetchRequest("https://slv-places-481615284700.australia-southeast1.run.app/cua.json", {method: "HEAD"});
fetchRequest("https://sands-mcdougalls-directories-481615284700.australia-southeast1.run.app/sands-mcdougalls-directories-victoria.json", {method: "HEAD"});