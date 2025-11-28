import L from 'leaflet';
import $ from "jquery";

import "bulma/css/versions/bulma-prefixed.css"
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import './style.css'

$(function() {
  let geoDataLayer;
  let manifestURL;
  let urlParams = new URLSearchParams(window.location.search);
  let currentRoad = urlParams.get('road');

  function getImages(manifest) {
    let images = [];
    console.log(manifest);
    for (let canvas of manifest.sequences[0].canvases) {
      images.push(canvas.images[0].resource.service["@id"]);
    }
    return images
  }

  function getManifest(feature, side) {
    $("#gallery").empty();
    manifestURL = "https://wraggelabs.com/slv_iiif/" + feature.properties.sides[side].images[0].ie_id + "?group=true";
    fetch(manifestURL)
        .then(response => response.json())
        .then(manifest => getImages(manifest))
        .then(images => displayImages(feature, images, side))
  }

  function showTabs(feature) {
    $("div.bulma-tabs > ul").empty()
    if (feature.properties.sides.length > 1) {
        $.each(feature.properties.sides, function(i, sideDetails) {
          console.log(sideDetails)
          $("div.bulma-tabs > ul").append($("<li>").append($("<a>").text(sideDetails.sides).click(function() {displayImages(feature, i); $("div.bulma-tabs li").toggleClass("bulma-is-active")})));
        });
        $("div.bulma-tabs li").first().addClass("bulma-is-active");
    }
  }

  function displayImages(feature, side) {
    $("#gallery").empty();
    $("#info").html(feature.properties.sides[side].title);
    const imageBar = $("#gallery");
    console.log(imageBar);
    $.each(feature.properties.sides[side].images, function(index, image) {
      let imageUrl = `https://rosetta.slv.vic.gov.au/iiif/2/${image.ie_id}:${image.image_id}.jpg/full/,500/0/default.jpg`
      imageBar.append($("<img loading='lazy'>").attr("src", imageUrl).click(function(e) {viewImage($(this).attr("src")); openModal();}));
    });
  }

  function openModal() {
    $("#map").hide();
    $(".bulma-modal").addClass("bulma-is-active");
  }
  function closeModal() {
    $("#map").show();
    $(".bulma-modal").removeClass("bulma-is-active");
  }

  // Add click events and styles to individual map features
  function onEachFeature(feature, layer) {
    // Click function for roads
    layer.on('click', function (e) {
      console.log("Loading..." + feature.properties.id);
      $("#info").html("Loading photos from " + feature.properties.sides[0].title);
      showTabs(feature);
      geoDataLayer.resetStyle();
      layer.setStyle({ color: "red" });
      history.pushState(null, null, `${window.location.href.split("?")[0]}?road=${feature.properties.id}`);
      displayImages(feature, 0);
      //getManifest(feature, side);
    })
    // Select feature based on url params
    if (feature.properties.id == currentRoad) {
      console.log(currentRoad);
      layer.setStyle({ color: "red" });
      map.fitBounds(layer.getBounds());
      showTabs(feature);
      displayImages(feature, 0);
      //getManifest(feature, side);
    } 
    // Add tooltip
    let titles = [];
    for (let side of feature.properties.sides) {
      titles.push(side.title);
    }
    layer.bindTooltip(titles.join(" / "));
  }

  // Make the map
  const map = L.map('map').setView([-37.815, 144.965], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  fetch("https://raw.githubusercontent.com/StateLibraryVictoria-SLVLAB/geo-maps-residency/refs/heads/main/cua-road-segments.geojson")
    .then(response => response.json())
    .then(geodata => L.geoJSON(geodata, {onEachFeature: onEachFeature, style: {"color": "#3388ff", "weight": 5, "opacity": 0.6}}).addTo(map))
    .then(newLayer => geoDataLayer = newLayer );

  // modal
  $(".modal-background, .modal-close, .delete, button#modal-close").click(function() {closeModal();})
  document.addEventListener('keydown', (event) => {
    if(event.key === "Escape") {
      closeModal();
    }
  });

  // UV

  function viewImage(imageURL) {
    let digitalID = imageURL.match(/(IE\d+)/)[0];
    let slvURL = "https://viewer.slv.vic.gov.au/?entity=" + digitalID + "&mode=browse";
    $("#slv-link").attr("href", slvURL);
    $("#seadragon-viewer").empty();
    var viewer = OpenSeadragon({
      id: "seadragon-viewer",
      prefixUrl: "//openseadragon.github.io/openseadragon/images/",
      tileSources: [imageURL.replace("full/,500/0/default.jpg", "info.json")]
    });
  }
});