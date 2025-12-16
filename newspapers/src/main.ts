import $ from "jquery";
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import "bulma/css/versions/bulma-prefixed.css"
import './style.scss'

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

  async function addPlaces(geojson) {
    map.getSource("newspaper-data").setData(geojson);
    // Geographic coordinates of the LineString
    const coordinates = geojson.features[0].geometry.coordinates;

    // Pass the first coordinates in the LineString to `lngLatBounds` &
    // wrap each coordinate pair in `extend` to include them in the bounds
    // result. A variation of this technique could be applied to zooming
    // to the bounds of multiple Points or Polygon geometries - it just
    // requires wrapping all the coordinates with the extend method.
    const bounds = geojson.features.reduce((bounds, feature) => {
        return bounds.extend(feature.geometry.coordinates);
    }, new maplibregl.LngLatBounds(geojson.features[0].geometry.coordinates, geojson.features[0].geometry.coordinates));

    map.fitBounds(bounds, {
        padding: 20
    });

  }

  async function getPlaces(lat, lng) {
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/newspapers/places_from_point.json?longitude=${lng}&latitude=${lat}&distance=100000&limit=20&_shape=array`;
    const response = await fetchRequest(url);
    const json = await response.json();
    let geojson = {"type": "FeatureCollection", "features": []};
    for (let place of json) {
      let feature = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [place.longitude, place.latitude]}, "properties": {"placename": place.placename, "num_titles": place.num_titles, "distance": place.distance}};
      geojson["features"].push(feature);
    }
    console.log(geojson);
    addPlaces(geojson);
    getTitles(geojson);
  }

  function titleFromPlace(title, place) {
    return title.placename == place;
  }

  async function addTitle(title) {
    let links = [];
    if (title.alma_id) {
      links.push(`<a href="https://find.slv.vic.gov.au/discovery/fulldisplay?vid=61SLV_INST:SLV&docid=alma${title.alma_id}">Catalogue</a>`);
    }
    if (title.trove_url) {
      links.push(`<a href="${title.trove_url}">Trove</a>`);
    }
    let itemTemplate = `
        <article class="bulma-media bulma-pt-0 bulma-mt-0">
          <div class="bulma-media-content">
            <table class="bulma-table bulma-is-size-7 bulma-mt-0">
            <tr><th colspan=2>${title.title}</th></tr>
            ${title.date ? `<tr><th>Date</th><td>${title.date}</td></tr>` : ''}
            ${title.publisher ? `<tr><th>Publisher</th><td>${title.publisher}</td></tr>` : ''}
            <tr><td colspan=2>${links.join(" &middot; ")}</td>
            </table>
          </div>
        </article>
    `
    let item = $(itemTemplate);
    $("#results").append(item);
  }

  async function displayTitles(geojson, titles) {
    for (let feature of geojson.features) {
      const placename = feature.properties.placename;
      const distance = parseFloat((feature.properties.distance / 1000).toFixed(2));
      const placeTitles = titles.filter((title) => title.placename == placename);
      console.log(placeTitles);
      $("#results").append($(`<h4 class="bulma-title bulma-is-size-5 bulma-is-uppercase bulma-has-text-weight-light bulma-has-text-primary">${placename} (${distance}km)</h4>`));
      for (let title of placeTitles) {
        addTitle(title);
      }
    }
  }

  async function getTitles(geojson) {
    const places = [];
    for (let feature of geojson.features) {
      places.push(feature.properties.placename)
    }
    const url = `https://slv-places-481615284700.australia-southeast1.run.app/newspapers/titles_by_places.json?places=["${places.join('","')}"]&_shape=array`;
    const response = await fetchRequest(url);
    const titles = await response.json();
    console.log(titles);
    displayTitles(geojson, titles);
  }

  var currentPoint;

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

  map.on('click', function(ev) {
    if (currentPoint) {
      currentPoint.remove();
    }
    currentPoint = new maplibregl.Marker()
      .setLngLat([ev.lngLat.lng, ev.lngLat.lat])
      .addTo(map);
    $("#results").empty();
    getPlaces(ev.lngLat.lat, ev.lngLat.lng);
  });
  map.on('load', () => {
    map.addSource('newspaper-data', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
    map.addLayer({
        'id': 'newspaper-places',
        'type': 'circle',
        'source': 'newspaper-data',
        'paint': {
            'circle-radius': [
                      'step',
                      ['get', 'num_titles'],
                      10,
                      6,
                      15,
                      11,
                      20,
                      21,
                      25,
                      31,
                      30,
                      41,
                      35,
                      51,
                      40

            ],
            'circle-color': '#4258ff',
            "circle-opacity": 0.7
        }
    });
  });

  // Create a popup, but don't add it to the map yet.
  const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
  });

  // Make sure to detect marker change for overlapping markers
  // and use mousemove instead of mouseenter event
  let currentFeatureCoordinates = undefined;
  map.on('mousemove', 'newspaper-places', (e) => {
      const featureCoordinates = e.features[0].geometry.coordinates.toString();
      if (currentFeatureCoordinates !== featureCoordinates) {
          currentFeatureCoordinates = featureCoordinates;

          // Change the cursor style as a UI indicator.
          map.getCanvas().style.cursor = 'pointer';

          const coordinates = e.features[0].geometry.coordinates.slice();
          const placename = e.features[0].properties.placename;
          const numTitles = e.features[0].properties.num_titles;

          // Ensure that if the map is zoomed out such that multiple
          // copies of the feature are visible, the popup appears
          // over the copy being pointed to.
          while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
              coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
          }

          // Populate the popup and set its coordinates
          // based on the feature found.
          popup.setLngLat(coordinates).setHTML(`<b>${placename}</b><br />${numTitles} title${numTitles > 1 ? "s" : ""}`).addTo(map);
      }
  });

  map.on('mouseleave', 'newspaper-places', () => {
      currentFeatureCoordinates = undefined;
      map.getCanvas().style.cursor = '';
      popup.remove();
  });

  function openModal() {
    $(".bulma-modal").addClass("bulma-is-active");
  }
  function closeModal() {
    $(".bulma-modal").removeClass("bulma-is-active");
  }

  $("#about-link").click(function() {openModal();})

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
