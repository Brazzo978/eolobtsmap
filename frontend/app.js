const map = L.map('map').setView([0, 0], 2);

// Ensure the map resizes with the browser window
window.addEventListener('resize', () => {
  map.invalidateSize();
});

let provider = 'satellite';

const tileProviders = {
  standard: [
    {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
  ],
  satellite: [
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        maxZoom: 19,
        attribution:
          'Tiles © Esri — Source: Esri, Earthstar Geographics, NGA, USGS, GEBCO, DeLorme, NAVTEQ, and others',
      },
    },
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19 },
    },
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19 },
    },
  ],
};

let tileLayers = [];

function setProviderLayers() {
  tileLayers.forEach((layer) => map.removeLayer(layer));
  tileLayers = tileProviders[provider].map((p) =>
    L.tileLayer(p.url, {
      updateWhenIdle: false,
      updateWhenZooming: true,
      ...p.options,
    }).addTo(map)
  );
  // Ensure scroll zoom remains active after switching provider
  map.scrollWheelZoom.enable();
  // Force a refresh so overlay elements update immediately
  map.invalidateSize();
}

setProviderLayers();

const mapToggle = document.getElementById('mapToggle');
if (mapToggle) {
  mapToggle.textContent =
    provider === 'satellite' ? 'Mappa standard' : 'Vista satellite';
  mapToggle.addEventListener('click', () => {
    provider = provider === 'satellite' ? 'standard' : 'satellite';
    setProviderLayers();
    mapToggle.textContent =
      provider === 'satellite' ? 'Mappa standard' : 'Vista satellite';
  });
}

const markersById = {};
const modal = document.getElementById('markerModal');
const form = document.getElementById('markerForm');

fetch('/markers')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then((markers) => {
    markers.forEach((marker) => {
      addMarker(marker);
    });
  })
  .catch((err) => {
    console.error('Failed to load markers', err);
  });

map.on('click', (e) => {
  openModal({ lat: e.latlng.lat, lng: e.latlng.lng, images: [] });
});

document.getElementById('cancelModal').addEventListener('click', () => {
  modal.classList.remove('show');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('markerId').value;
  const marker = {
    nome: document.getElementById('markerName').value,
    descrizione: document.getElementById('markerDesc').value,
    lat: parseFloat(document.getElementById('markerLat').value),
    lng: parseFloat(document.getElementById('markerLng').value),
    images: [],
  };
  if (id) {
    marker.id = Number(id);
    if (markersById[id]) {
      marker.images = markersById[id].data.images || [];
    }
  }
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/markers/${id}` : '/markers';
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(marker),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error('Request failed');
      }
      return res.json().catch(() => ({}));
    })
    .then((data) => {
      modal.classList.remove('show');
      if (id) {
        const existing = markersById[id];
        existing.data.nome = marker.nome;
        existing.data.descrizione = marker.descrizione;
        existing.data.lat = marker.lat;
        existing.data.lng = marker.lng;
        existing.marker.setLatLng([marker.lat, marker.lng]);
        existing.marker.setPopupContent(createPopupContent(existing.data));
      } else {
        marker.id = data.id;
        addMarker(marker);
      }
    })
    .catch((err) => console.error(err));
});

function addMarker(marker) {
  if (!marker.images) marker.images = [];
  const leafletMarker = L.marker([marker.lat, marker.lng], { draggable: true }).addTo(map);
  leafletMarker.bindPopup(createPopupContent(marker));
  leafletMarker.on('popupopen', () => {
    attachPopupEvents(marker, leafletMarker);
  });
  leafletMarker.on('dragend', () => {
    const pos = leafletMarker.getLatLng();
    marker.lat = pos.lat;
    marker.lng = pos.lng;
    saveMarker(marker);
  });
  markersById[marker.id] = { data: marker, marker: leafletMarker };
}

function attachPopupEvents(marker, leafletMarker) {
  const popup = leafletMarker.getPopup().getElement();
  popup.querySelector('.edit-marker').addEventListener('click', () => {
    openModal(marker);
  });
  popup.querySelector('.delete-marker').addEventListener('click', () => {
    if (confirm('Eliminare questo marker?')) {
      fetch(`/markers/${marker.id}`, { method: 'DELETE' }).then((res) => {
        if (res.ok) {
          map.removeLayer(leafletMarker);
          delete markersById[marker.id];
        }
      });
    }
  });
  popup.querySelectorAll('.delete-image').forEach((btn) => {
    const imageId = btn.dataset.imageId;
    btn.addEventListener('click', () => {
      if (confirm('Eliminare questa immagine?')) {
        fetch(`/markers/${marker.id}/images/${imageId}`, { method: 'DELETE' }).then(
          (res) => {
            if (res.ok) {
              marker.images = marker.images.filter(
                (img) => String(img.id) !== String(imageId)
              );
              leafletMarker.setPopupContent(createPopupContent(marker));
              leafletMarker.openPopup();
            }
          }
        );
      }
    });
  });
}

function openModal(marker) {
  document.getElementById('markerId').value = marker.id || '';
  document.getElementById('markerName').value = marker.nome || '';
  document.getElementById('markerDesc').value = marker.descrizione || '';
  document.getElementById('markerLat').value = marker.lat;
  document.getElementById('markerLng').value = marker.lng;
  modal.classList.add('show');
}

function saveMarker(marker) {
  fetch(`/markers/${marker.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(marker),
  }).catch((err) => console.error('Update failed', err));
}

function createPopupContent(marker) {
  let html = '';
  if (marker.nome) {
    html += `<h3>${marker.nome}</h3>`;
  }
  if (marker.descrizione) {
    html += `<p>${marker.descrizione}</p>`;
  }
  if (Array.isArray(marker.images) && marker.images.length) {
    html += '<div class="popup-images">';
    marker.images.forEach((img) => {
      const caption = img.didascalia ? `alt="${img.didascalia}"` : '';
      html += `<div><img src="${img.url}" ${caption}/><button class="delete-image" data-image-id="${img.id}">Elimina immagine</button></div>`;
    });
    html += '</div>';
  }
  html +=
    '<button class="edit-marker">Modifica</button> <button class="delete-marker">Elimina</button>';
  return html;
}
