import $ from "jquery";
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WarpedMapLayer } from '@allmaps/maplibre'
import LayerManager from 'maplibre-gl-layer-manager';
import 'maplibre-gl-layer-manager/src/layer-manager.css';
import "bulma/css/versions/bulma-prefixed.css"

import './style.css'

$(function() {
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

    var currentPoint;
    var layerManager;

    // Define the map syle (OpenStreetMap raster tiles)
    const mapStyle = {
    "version": 8,
    "sources": {
      "osm": {
        "type": "raster",
        "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
        "tileSize": 256,
        "attribution": "&copy; OpenStreetMap Contributors",
        "maxzoom": 19
      }
    },
    "layers": [
      {
        "id": "osm",
        "type": "raster",
        "source": "osm" // This must match the source key above
      }
    ]
    };

    const map = new maplibregl.Map({
      container: 'map', // container id
      style: mapStyle,
      center: [144.965, -36.815], // starting position [lng, lat]
      zoom: 7 // starting zoom
    });

    map.addControl(new maplibregl.NavigationControl({
      showZoom: true,
    }));

    map.on("load", function () {
    // Create the layer manager
      layerManager = new LayerManager({
        title: "Panel",
        layers: [
          {
            id: "osm",
            name: "Background",
            visible: true,
            opacity: 1.0,
          }
        ],
        position: "top-left",
        collapsed: true,
  });

  // Add the control to the map
  map.addControl(layerManager, "top-left");
});
    
    

    map.on('click', function(ev) {
        selectPoint(ev.lngLat.lat, ev.lngLat.lng);
    });


    function selectPoint(lat, lon) {
        removeAllLayers();
        if (currentPoint) {
          currentPoint.remove();
        }
        currentPoint = new maplibregl.Marker()
          .setLngLat([lon, lat])
          .addTo(map);
        $("#results").empty();
        $("#selected").empty();
        if (mapIds.length > 0) {
            mapIds.forEach((mapId, index) => {
                getMapData(mapId, lat, lon, index);
            });
        } else {
            getMapSearchData(lat, lon);
            history.pushState(null, null, `${window.location.href.split("?")[0]}?lat=${lat}&lon=${lon}`);
        }
    }

    async function getMapSearchData(lat, lng) {
        const url = `https://slv-places-481615284700.australia-southeast1.run.app/georeferenced_maps/maps_from_point.json?longitude=${lng}&latitude=${lat}&distance=50000&_shape=array`;
        const response = await fetchRequest(url);
        const mapData = await response.json();
        console.log(mapData);
        displayResults(mapData);
    }

    function findPreviousResult(index) {
        for (let i = index -1; i >= 0 ; i--) {
            let article = $(`#results article[data-order="${i}"]`);
            if (article && article.length > 0)  {
                return article;
            }
        }
        return null;
    }

    function removeAllLayers() {
        const layers = map.getLayersOrder();
        layers.forEach((layerId) => {
            if (layerId != "osm") {
                layerManager.removeLayer(layerId);
            }
        });
    }

    async function removeWarpedMap(allmapsId, item) {
        console.log("remove");
        const idNum = allmapsId.split("/").pop();
        //console.log(warpedMapLayer.getMapIds());
        //console.log(allmapsId);
        //let removed = await warpedMapLayer.removeGeoreferenceAnnotationByUrl(allmapsId);
        console.log(map.getLayersOrder());
        //map.removeLayer(idNum);
        layerManager.removeLayer(idNum);
        history.pushState(null, null, `${window.location.href.replace("&map_id=" + idNum, "")}`);
        
        let index = item.data("order");
        console.log(parseInt(index)-1);
        if (index == 0) {
            $("#results").prepend(item);
        } else {
            let previous = findPreviousResult(index);
            
            if (previous && previous.length > 0) {
                console.log(previous.length);
                previous.after(item)
            } else {
                $("#results").prepend(item);
            }
        }
        //$(`article[data-order="${parseInt(index)-1}"]`).after(item);
        item.one("click", function() {
            $(this).toggleClass("map-selected");
            addWarpedMap(allmapsId, $(this));
        });
    }

    async function addWarpedMap(allmapsId, item, title) {
        console.log("add");
        console.log(allmapsId);
        const idNum = allmapsId.split("/").pop();
        const warpedMapLayer = new WarpedMapLayer({layerId: idNum});
        map.addLayer(warpedMapLayer);
        await warpedMapLayer.addGeoreferenceAnnotationByUrl(allmapsId);
        //await warpedMapLayer.addGeoreferenceAnnotationByUrl(allmapsId)
        //const response = await fetchRequest(allmapsId);
        //const annotation = await response.json();
        //const warpedMapLayer = await new WarpedMapLayer(annotation).addTo(mapLayer);
        //warpedMapLayer.setOpacity(parseFloat(slider.value));
        //warpedMapLayer.bindTooltip(title);
        const bounds = warpedMapLayer.getBounds();
        map.fitBounds(bounds, {padding: [25,25]});
        layerManager.addLayer({
          id: idNum,
          name: item.data("title").split("/")[0],
          visible: true,
          opacity: 1.0,
        });
        if (!window.location.href.includes(idNum)) {
            history.pushState(null, null, `${window.location.href}&map_id=${idNum}`);
        }
        //console.log(mapIds);
        //const idIndex = mapIds.indexOf(idNum);
        //if (idIndex !== -1) {
        //    mapIds.splice(idIndex, 1);
        //}
        //console.log(mapIds);
        $("#selected").prepend(item);
        item.one("click", function() {
            $(this).toggleClass("map-selected");
            removeWarpedMap(allmapsId, $(this));
        });
    }

    async function addResult(gmap, index, warp) {
        $("#info").show();
        let itemTemplate = `
            <article data-title="${gmap.title}" data-order="${index}" class="bulma-media bulma-pt-0 bulma-mt-0">
              <figure class="bulma-media-left">
                <p class="bulma-image bulma-is-128x128">
                  <img loading="lazy" src="${gmap.image_id}/square/256,/0/default.jpg" />
                </p>
              </figure>
              <div class="bulma-media-content">
                <table class="bulma-table bulma-is-size-7 bulma-mt-0">
                <tr><th colspan=2>${gmap.title}</th></tr>
                <tr><th>Date</th><td>${gmap.date}</td></tr>
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
        mapData.forEach((gmap, index) => {
            addResult(gmap, index);
        });
    }

    async function getMapData(mapId, lat, lon, index) {
        const url = `https://slv-places-481615284700.australia-southeast1.run.app/georeferenced_maps/maps_by_id.json?map_id=${mapId}&latitude=${lat}&longitude=${lon}&_shape=array`;
        const response = await fetchRequest(url);
        const mapData = await response.json();
        addResult(mapData[0], index, true);
    }

    async function getMapCount() {
        const countUrl = "https://slv-places-481615284700.australia-southeast1.run.app/georeferenced_maps.json?sql=select+count%28%29+as+count+from+maps&_shape=array"
        const response = await fetchRequest(countUrl);
        const countData = await response.json();
        $("span#map-count").text(countData[0].count);
    }

    getMapCount();
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

      function openModal(modal) {
    $(`#${modal}`).addClass("bulma-is-active");
  }
  function closeModal() {
    $(".bulma-modal").removeClass("bulma-is-active");
  }

  $("#about-link").click(function() {openModal("modal-about");})

  $(".bulma-modal-background, .bulma-modal-close, .delete, button#modal-close").click(function() {closeModal();})
  document.addEventListener('keydown', (event) => {
    if(event.key === "Escape") {
      closeModal();
    }
  });
  $(".bulma-navbar-burger").click(function() {

      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".bulma-navbar-burger").toggleClass("bulma-is-active");
      $(".bulma-navbar-menu").toggleClass("bulma-is-active");

  });
});