import $ from "jquery";

import "bulma/css/versions/bulma-prefixed.css"
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.scss'

$(function() {

  let photoData;
  let urlParams = new URLSearchParams(window.location.search);
  let currentWay = urlParams.get('way');
  let currentPhotoset = urlParams.get('photoset');

  async function loadPhotoData() {
    if (photoData === undefined) {
      let response = await fetch("/cua-photos.json");
      photoData = await response.json();
    }
  }

  function loadState(state) {
    if ("way" in state) {
      getPhotosets(state.way);
    } else if ("photoset" in state) {
      getPhotoset(state.photoset);
    }
  }


  async function getPhotoset(photosetId) {
    await loadPhotoData();
    for (let photoset of photoData) {
      if (photoset.id == photosetId) {
        displayPhotoset(photoset);
      }
    }
  }

  async function getPhotosets(wayId) {
    await loadPhotoData();
    console.log(wayId);
    let photosets = [];
    for (let photoset of photoData) {
      if (photoset.ways.includes(wayId.toString())) {
        photosets.push(photoset);
      }
    }
    console.log(photosets);
    if (photosets.length > 1) {
      listPhotosets(photosets, wayId);
    } else {
      displayPhotoset(photosets[0]);
    }
  }

  function listPhotosets(photosets, wayId) {
    history.pushState({way: wayId}, null, `${window.location.href.split("?")[0]}?way=${wayId}`);
    $("#gallery").empty();
    $("#photosets").empty().show();
    $(".bulma-tabs > ul").empty();
    $("#info").html("Select a photo set...");
    highlightSelectedPhotosets(photosets);
    let setList = $("<ul>");
    for (let photoset of photosets) {
      let sides = [];
      for (let side of photoset.sides) {
        sides.push(side.side);
      }
      let psLink = $("<a>").html(`${photoset.title} (${sides.join(", ")})`).click(function() {displayPhotoset(photoset);})
      setList.append($("<li>").append(psLink));
      $("#photosets").append(setList);
    }
  }

  function displayPhotoset(photoset) {
    history.pushState({photoset: photoset.id}, null, `${window.location.href.split("?")[0]}?photoset=${photoset.id}`);
    showTabs(photoset);
    displayImages(photoset, 0);
  }

  function showTabs(photoset) {
    $("div.bulma-tabs > ul").empty()
    $.each(photoset.sides, function(i, sideDetails) {
      console.log(sideDetails)
      $("div.bulma-tabs > ul").append($("<li>").append(
        $("<a>").text(sideDetails.side).click(function() {
          displayImages(photoset, i); 
          $("div.bulma-tabs li").removeClass("bulma-is-active"); 
          $(this).parent().addClass("bulma-is-active");
          console.log($(this).parent());
        })
      ));
    });
    $("div.bulma-tabs li").first().addClass("bulma-is-active");
  }

  function highlightSelectedPhotosets(photosets) {
    map.getSource("selected-photoset").setData({type: 'FeatureCollection', features: []});
    const features = [];
    let bounds = new maplibregl.LngLatBounds(photosets[0].paths[0][0], photosets[0].paths[0][0]);
    for (let photoset of photosets) {
      features.push({
        'type': 'Feature',
        'geometry': {
            'type': 'MultiLineString',
            'coordinates': photoset.paths
          }
      });
      for (let path of photoset.paths) {
        for (let point of path) {
          bounds = bounds.extend(point);
        }
      }
    }
    let geojson = {
      'type': 'FeatureCollection',
      'features': features
    };
    console.log(geojson);
    map.getSource("selected-photoset").setData(geojson);
    map.fitBounds(bounds, {
      padding: 100,
      maxZoom: 17
    });
  }

  function displayImages(photoset, side) {
    highlightSelectedPhotosets([photoset]);
    $("#gallery").empty();
    $("#photosets").empty().hide();
    $("#info").html(photoset.title);
    const imageBar = $("#gallery");
    console.log(imageBar);
    $.each(photoset.sides[side].images, function(index, image) {
      let imageUrl = `https://rosetta.slv.vic.gov.au/iiif/2/${image.ie_id}:${image.image_id}.jpg/full/,500/0/default.jpg`
      imageBar.append($("<img loading='lazy'>").attr("src", imageUrl).click(function(e) {viewImage($(this).attr("src")); openModal("modal-zoom");}));
    });
  }

  // Make the map
  // Define the map syle (OpenStreetMap raster tiles)
  const mapStyle = {
    "version": 8,
    "sources": {
      "osm": {
        "type": "raster",
        "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
        "tileSize": 256,
        "attribution": "&copy; OpenStreetMap Contributors",
        "maxzoom": 17
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
      center: [144.95, -37.283333], // starting position [lng, lat]
      zoom: 8 // starting zoom
  });

  map.addControl(new maplibregl.NavigationControl({
      showZoom: true,
  }));

  map.on('load', () => {
    map.addSource('cua-data', {type: 'geojson', data: '/cua-ways.geojson'});
    map.addSource('selected-photoset', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
    map.addLayer({
        'id': 'cua-roads',
        'type': 'line',
        'source': 'cua-data',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false],
                    "red",
                    '#3388ff'
                ],
            'line-width': 8,
            'line-opacity': 0.5
        }
    });
    map.addLayer({
        'id': 'selected-photoset-layer',
        'type': 'line',
        'source': 'selected-photoset',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': "red",
            'line-width': 8,
            'line-opacity': 1
        }
    });
    if (currentWay) {
      history.replaceState({way: currentWay}, "", document.location.href);
      getPhotosets(currentWay);
    }
    if (currentPhotoset) {
      history.replaceState({photoset: currentPhotoset}, "", document.location.href);
      getPhotoset(currentPhotoset);
    }
  });

  map.on('click', 'cua-roads', (e) => {
      // This changes the colour of the geojson line
      //if (selectedWay !== null) {
      //    map.setFeatureState(
      //        { source: 'cua-data', id: selectedWay },
      //        { selected: false }
      //    );
      //}
      //selectedWay = e.features[0].id;
      //map.setFeatureState(
      //    { source: 'cua-data', id: selectedWay },
      //    { selected: true }
      //);
      const coordinates = e.features[0].geometry.coordinates;
      // Pass the first coordinates in the LineString to `lngLatBounds` &
      // wrap each coordinate pair in `extend` to include them in the bounds
      // result. A variation of this technique could be applied to zooming
      // to the bounds of multiple Points or Polygon geometries - it just
      // requires wrapping all the coordinates with the extend method.
      const bounds = coordinates.reduce((bounds, coord) => {
          return bounds.extend(coord);
      }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

      map.fitBounds(bounds, {
          padding: 20
      });
      console.log(e.features[0].id);
      getPhotosets(e.features[0].id);
  });

  // Change the cursor to a pointer when the mouse is over the places layer.
        map.on('mouseenter', 'cua-roads', () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        // Change it back to a pointer when it leaves.
        map.on('mouseleave', 'cua-roads', () => {
            map.getCanvas().style.cursor = '';
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
  window.addEventListener("popstate", (event) => {
    // If a state has been provided, we have a "simulated" page
    // and we update the current page.
    if (event.state) {
      // Simulate the loading of the previous page
      loadState(event.state);
    }
  });

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