const imagery = L.esri.basemapLayer('Imagery', { crossOrigin: 'anonymous' });
const labels = L.esri.basemapLayer('ImageryLabels', { crossOrigin: 'anonymous' });
const hybrid = L.layerGroup([imagery, labels]);
const standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19,
  crossOrigin: 'anonymous'
});
const map = L.map('map', { layers: [hybrid] }).setView([45.4642, 9.1900], 13);
L.control.layers({
  'Hybrid (sat+etichette)': hybrid,
  'Stradale (OSM)': standard
}, null, { position: 'bottomleft' }).addTo(map);

const markerClusters = L.markerClusterGroup();
map.addLayer(markerClusters);

// Context menu handling
const mapContextMenu = document.getElementById('mapContextMenu');
const insertMarkerBtn = document.getElementById('insertMarkerBtn');
let savedLat, savedLng;
const tagFilter = document.getElementById('tagFilter');
const markerTagContainer = document.getElementById('markerTags');
const tagTabsContainer = document.getElementById('tagTabsContainer');
const tagTabs = document.getElementById('tagTabs');
const tagTabContents = document.getElementById('tagTabContents');
const viewTagTabsContainer = document.getElementById('viewTagTabsContainer');
const viewTagTabs = document.getElementById('viewTagTabs');
const viewTagContents = document.getElementById('viewTagContents');
let tagColors = {};
const mergeModeBtn = document.getElementById('mergeModeBtn');
const mergeSelectedBtn = document.getElementById('mergeSelectedBtn');
let mergeMode = false;
const selectedMarkers = new Set();
const form = document.getElementById('markerForm');
let currentEditMarker = null;
let editingTagDetails = {};
const annotationModeBtn = document.getElementById('annotationModeBtn');
const annotationOverlay = document.getElementById('annotationOverlay');
let annotationMode = false;
let annotStartX, annotStartY, annotationRect;

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  if (typeof tags === 'string') {
    const str = tags.trim();
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return str.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}
const selectedIcon = L.divIcon({
  className: 'custom-pin',
  html: '<i class="material-icons" style="color:#ff9800">place</i>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const tagsPromise = fetch('/tags')
  .then((res) => res.json())
  .then((data) => {
    tagColors = data;
    const tags = Object.keys(data);
    tags.forEach((t) => {
      if (tagFilter) {
        const optFilter = document.createElement('option');
        optFilter.value = t;
        optFilter.textContent = t;
        tagFilter.appendChild(optFilter);
      }
      if (markerTagContainer) {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${t}" /> <span>${t}</span>`;
        markerTagContainer.appendChild(label);
      }
    });
    if (window.M && M.FormSelect && tagFilter) {
      M.FormSelect.init(tagFilter, { dropdownOptions: { closeOnClick: false } });
    }
  });

map.on('contextmenu', (e) => {
  e.originalEvent.preventDefault();
  savedLat = e.latlng.lat;
  savedLng = e.latlng.lng;
  mapContextMenu.style.left = `${e.containerPoint.x}px`;
  mapContextMenu.style.top = `${e.containerPoint.y}px`;
  mapContextMenu.classList.add('show');
});

insertMarkerBtn.addEventListener('click', () => {
  const token = localStorage.getItem('token');
  if (!token) {
    loginModal.classList.add('show');
  } else {
    openModal({ lat: savedLat, lng: savedLng, images: [] });
  }
  mapContextMenu.classList.remove('show');
});

document.addEventListener('click', (e) => {
  if (mapContextMenu.classList.contains('show') && !mapContextMenu.contains(e.target)) {
    mapContextMenu.classList.remove('show');
  }
});

// Ensure the map resizes with the browser window
window.addEventListener('resize', () => {
  map.invalidateSize();
});

// Login modal handling and auth UI
const loginLink = document.getElementById('loginLink');
const logoutLink = document.getElementById('logoutLink');
const adminLink = document.getElementById('adminLink');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const markerViewModal = document.getElementById('viewMarkerModal');
let currentUserRole = null;
if (loginLink && loginModal && loginForm) {
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.classList.add('show');
  });
  document.getElementById('cancelLogin').addEventListener('click', () => {
    loginModal.classList.remove('show');
  });
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;
    fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Login failed');
        }
        return res.json();
      })
      .then((data) => {
        localStorage.setItem('token', data.token);
        loginModal.classList.remove('show');
        updateUI();
      })
      .catch(() => alert('Login fallito'));
  });
}

if (logoutLink) {
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    updateUI();
  });
}

if (mergeModeBtn) {
  mergeModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    mergeMode = !mergeMode;
    if (!mergeMode) {
      mergeModeBtn.textContent = 'Modalità unione';
      if (mergeSelectedBtn) mergeSelectedBtn.style.display = 'none';
      clearSelection();
    } else {
      mergeModeBtn.textContent = 'Esci unione';
    }
  });
}

if (mergeSelectedBtn) {
  mergeSelectedBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (selectedMarkers.size < 2) return;
    const ids = Array.from(selectedMarkers);
    fetch('/markers/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem('token'),
      },
      body: JSON.stringify({ ids }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Merge failed');
        return res.json();
      })
      .then((marker) => {
        ids.forEach((id) => {
          if (String(id) !== String(marker.id) && markersById[id]) {
            markerClusters.removeLayer(markersById[id].marker);
            delete markersById[id];
          }
        });
        if (markersById[marker.id]) {
          const entry = markersById[marker.id];
          entry.data = marker;
          entry.marker.setLatLng([marker.lat, marker.lng]);
          entry.marker.setIcon(createTagIcon(marker.tags));
          markerClusters.refreshClusters(entry.marker);
        } else {
          addMarker(marker);
        }
        mergeMode = false;
        mergeModeBtn.textContent = 'Modalità unione';
        clearSelection();
        mergeSelectedBtn.style.display = 'none';
        applyTagFilter();
      })
      .catch(() => alert('Errore unione marker'));
  });
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

function updateUI() {
  const token = localStorage.getItem('token');
  if (token) {
    loginLink.style.display = 'none';
    logoutLink.style.display = 'inline';
    const payload = parseJwt(token);
    currentUserRole = payload ? payload.role : null;
    if (payload && payload.role === 'admin') {
      adminLink.style.display = 'inline';
      if (mergeModeBtn) mergeModeBtn.style.display = 'inline';
    } else {
      adminLink.style.display = 'none';
      if (mergeModeBtn) mergeModeBtn.style.display = 'none';
    }
  } else {
    loginLink.style.display = 'inline';
    logoutLink.style.display = 'none';
    adminLink.style.display = 'none';
    if (mergeModeBtn) mergeModeBtn.style.display = 'none';
    currentUserRole = null;
  }
  if (mergeSelectedBtn) mergeSelectedBtn.style.display = 'none';
  mergeMode = false;
  clearSelection();
}
updateUI();

// Password reset handling
const resetModal = document.getElementById('resetModal');
const resetForm = document.getElementById('resetForm');
const forgotPass = document.getElementById('forgotPass');
if (forgotPass) {
  forgotPass.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.classList.remove('show');
    resetModal.classList.add('show');
  });
  document.getElementById('cancelReset').addEventListener('click', () => {
    resetModal.classList.remove('show');
  });
  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    fetch('/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(() => {
      resetModal.classList.remove('show');
      alert('Email inviata se l\'indirizzo esiste');
    });
  });
}

// Search functionality
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  const coordMatch = query.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    map.setView([lat, lng], 15);
    L.marker([lat, lng]).addTo(map);
  } else {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((results) => {
        if (results && results.length) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          map.setView([lat, lng], 15);
        } else {
          alert('Nessun risultato trovato');
        }
      })
      .catch(() => alert('Errore di ricerca'));
  }
}
if (searchBtn && searchInput) {
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  });
}

const markersById = {};
const modal = document.getElementById('markerModal');

function clearSelection() {
  selectedMarkers.forEach((id) => {
    const entry = markersById[id];
    if (entry) {
      entry.marker.setIcon(createTagIcon(entry.data.tags));
    }
  });
  selectedMarkers.clear();
}

function toggleSelectMarker(id) {
  const entry = markersById[id];
  if (!entry) return;
  if (selectedMarkers.has(id)) {
    selectedMarkers.delete(id);
    entry.marker.setIcon(createTagIcon(entry.data.tags));
  } else {
    selectedMarkers.add(id);
    entry.marker.setIcon(selectedIcon);
  }
  if (mergeMode && mergeSelectedBtn) {
    mergeSelectedBtn.style.display = selectedMarkers.size >= 2 ? 'inline' : 'none';
  }
}

function renderTagInputs() {
  if (!markerTagContainer || !tagTabsContainer) return;

  const selected = Array.from(
    markerTagContainer.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

  // Preserve any values currently entered before re-rendering
  if (tagTabsContainer.style.display === 'block') {
    document.querySelectorAll('[id^="tagDesc-"]').forEach((el) => {
      const tag = el.id.replace('tagDesc-', '');
      const freqEl = document.getElementById(`tagFreq-${tag}`);
      editingTagDetails[tag] = {
        descrizione: el.value,
        frequenze: freqEl ? freqEl.value : '',
      };
    });
  } else {
    const descVal = document.getElementById('markerDesc').value;
    const freqVal = document.getElementById('markerFreq').value;
    selected.forEach((tag) => {
      editingTagDetails[tag] = {
        descrizione: descVal,
        frequenze: freqVal,
      };
    });
  }

  const sourceTag = selected.find((t) => editingTagDetails[t]);
  selected.forEach((tag) => {
    if (!editingTagDetails[tag] && sourceTag) {
      editingTagDetails[tag] = { ...editingTagDetails[sourceTag] };
    }
  });
  tagTabs.innerHTML = '';
  tagTabContents.innerHTML = '';
  if (selected.length <= 1) {
    tagTabsContainer.style.display = 'none';
    const descLabel = document.getElementById('markerDescLabel');
    const freqLabel = document.getElementById('markerFreqLabel');
    if (descLabel) descLabel.style.display = '';
    if (freqLabel) freqLabel.style.display = '';
    if (selected.length === 1) {
      const info = editingTagDetails[selected[0]] || {};
      document.getElementById('markerDesc').value = info.descrizione || '';
      document.getElementById('markerFreq').value = info.frequenze || '';
    }
    return;
  }
  tagTabsContainer.style.display = 'block';
  const descLabel = document.getElementById('markerDescLabel');
  const freqLabel = document.getElementById('markerFreqLabel');
  if (descLabel) descLabel.style.display = 'none';
  if (freqLabel) freqLabel.style.display = 'none';
  selected.forEach((tag, i) => {
    const tabId = `tagTab-${i}`;
    const li = document.createElement('li');
    li.className = 'tab';
    li.innerHTML = `<a href="#${tabId}">${tag}</a>`;
    tagTabs.appendChild(li);
    const div = document.createElement('div');
    div.id = tabId;
    div.innerHTML =
      `<label>Descrizione:<textarea id="tagDesc-${tag}"></textarea></label>` +
      `<label>Frequenze:<input type="text" id="tagFreq-${tag}" /></label>`;
    tagTabContents.appendChild(div);
  });
  M.Tabs.init(tagTabs);
  selected.forEach((tag) => {
    const info = editingTagDetails[tag] || {};
    const d = document.getElementById(`tagDesc-${tag}`);
    const f = document.getElementById(`tagFreq-${tag}`);
    if (d) d.value = info.descrizione || '';
    if (f) f.value = info.frequenze || '';
  });
}

if (markerTagContainer) {
  markerTagContainer.addEventListener('change', renderTagInputs);
}

function applyTagFilter() {
  const selected = tagFilter
    ? Array.from(tagFilter.selectedOptions)
        .map((o) => o.value)
        .filter(Boolean)
    : [];
  Object.values(markersById).forEach(({ data, marker }) => {
    if (
      selected.length === 0 ||
      (data.tags && selected.some((s) => data.tags.includes(s)))
    ) {
      if (!markerClusters.hasLayer(marker)) {
        markerClusters.addLayer(marker);
      }
    } else if (markerClusters.hasLayer(marker)) {
      markerClusters.removeLayer(marker);
    }
  });
}
if (tagFilter) {
  tagFilter.addEventListener('change', applyTagFilter);
}

function addMarkersInBatches(markers, batchSize = 500) {
  return new Promise((resolve) => {
    let index = 0;
    function processBatch() {
      const slice = markers.slice(index, index + batchSize);
      slice.forEach((m) => addMarker(m));
      index += batchSize;
      if (index < markers.length) {
        requestAnimationFrame(processBatch);
      } else {
        resolve();
      }
    }
    processBatch();
  });
}

tagsPromise
  .then(() => fetch('/markers'))
  .then((response) => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then((markers) => addMarkersInBatches(markers))
  .then(() => applyTagFilter())
  .catch((err) => {
    console.error('Failed to load markers', err);
  });

map.on('click', () => {
  if (mapContextMenu.classList.contains('show')) {
    mapContextMenu.classList.remove('show');
  }
});

document.getElementById('cancelModal').addEventListener('click', () => {
  modal.classList.remove('show');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('markerId').value;
  const selected = Array.from(
    document.querySelectorAll('#markerTags input[type="checkbox"]:checked')
  ).map((cb) => cb.value);
  const tagDetails = {};
  if (selected.length <= 1) {
    const tag = selected[0];
    if (tag) {
      tagDetails[tag] = {
        descrizione: document.getElementById('markerDesc').value,
        frequenze: document.getElementById('markerFreq').value,
      };
    }
  } else {
    selected.forEach((tag) => {
      tagDetails[tag] = {
        descrizione: document.getElementById(`tagDesc-${tag}`).value,
        frequenze: document.getElementById(`tagFreq-${tag}`).value,
      };
    });
  }
  const firstInfo = selected.length ? tagDetails[selected[0]] : {};
  const marker = {
    nome: document.getElementById('markerName').value,
    descrizione: firstInfo ? firstInfo.descrizione || '' : '',
    frequenze: firstInfo ? firstInfo.frequenze || '' : '',
    lat: parseFloat(document.getElementById('markerLat').value),
    lng: parseFloat(document.getElementById('markerLng').value),
    tags: selected,
    tagDetails,
    images: currentEditMarker && currentEditMarker.images
      ? currentEditMarker.images.slice()
      : [],
  };
  if (id) {
    marker.id = Number(id);
    if (currentEditMarker && currentEditMarker.localita) {
      marker.localita = currentEditMarker.localita;
    }
  }
  const files = document.getElementById('markerImages').files;
  if (marker.images.length + files.length > 10) {
    alert('Puoi caricare al massimo 10 immagini per marker');
    return;
  }
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/markers/${id}` : '/markers';
  fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify(marker),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error('Request failed');
      }
      return res.json().catch(() => ({}));
    })
    .then((data) => {
      marker.id = id ? Number(id) : data.id;
      marker.localita = data.localita || marker.localita || null;
      const token = localStorage.getItem('token');
      const uploads = Array.from(files).map((file) => {
        const fd = new FormData();
        fd.append('image', file);
        return fetch(`/markers/${marker.id}/images`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: fd,
        })
          .then((r) => {
            if (!r.ok) throw new Error('Upload failed');
            return r.json();
          })
          .then((imgData) => {
            marker.images.push(imgData);
          });
      });
      return Promise.all(uploads).then(() => {
        document.getElementById('markerImages').value = '';
        currentEditMarker = marker;
        if (id) {
          const existing = markersById[id];
          existing.data = marker;
          existing.marker.setLatLng([marker.lat, marker.lng]);
          existing.marker.setIcon(createTagIcon(marker.tags));
          markerClusters.refreshClusters(existing.marker);
        } else {
          addMarker(marker);
        }
        applyTagFilter();
        modal.classList.remove('show');
      });
    })
    .catch((err) => console.error(err));
});

function addMarker(marker) {
  if (!marker.images) marker.images = [];
  marker.tags = normalizeTags(marker.tags);
  const leafletMarker = L.marker([marker.lat, marker.lng], {
    draggable: false,
    icon: createTagIcon(marker.tags),
  });
  markerClusters.addLayer(leafletMarker);
  leafletMarker.on('click', () => {
    if (mergeMode) {
      toggleSelectMarker(marker.id);
    } else {
      openMarkerView(marker, leafletMarker);
    }
  });
  markersById[marker.id] = { data: marker, marker: leafletMarker };
}

function renderExistingImages() {
  const container = document.getElementById('existingImages');
  if (!container || !currentEditMarker) return;
  container.innerHTML = '';
  const imgs = currentEditMarker.images ? currentEditMarker.images.slice(0, 10) : [];
  imgs.forEach((img) => {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    const imageEl = document.createElement('img');
    imageEl.src = img.url;
    imageEl.alt = img.didascalia || '';
    imageEl.style.maxWidth = '100px';
    imageEl.style.maxHeight = '100px';
    const del = document.createElement('button');
    del.textContent = '×';
    del.className = 'btn red remove-img';
    del.style.position = 'absolute';
    del.style.top = '0';
    del.style.right = '0';
    del.dataset.imageId = img.id;
    wrapper.appendChild(imageEl);
    wrapper.appendChild(del);
    container.appendChild(wrapper);
  });
  container.querySelectorAll('.remove-img').forEach((btn) => {
    btn.addEventListener('click', () => {
      const imageId = btn.dataset.imageId;
      if (currentEditMarker.id && confirm('Eliminare questa immagine?')) {
        fetch(`/markers/${currentEditMarker.id}/images/${imageId}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        }).then((res) => {
          if (res.ok) {
            currentEditMarker.images = currentEditMarker.images.filter(
              (img) => String(img.id) !== String(imageId)
            );
            renderExistingImages();
          }
        });
      }
    });
  });
  const fileInput = document.getElementById('markerImages');
  if (fileInput) {
    fileInput.disabled = currentEditMarker.images && currentEditMarker.images.length >= 10;
  }
}

function openModal(marker) {
  currentEditMarker = marker;
  editingTagDetails = marker.tagDetails
    ? JSON.parse(JSON.stringify(marker.tagDetails))
    : {};
  if (currentEditMarker.images && currentEditMarker.images.length > 10) {
    currentEditMarker.images = currentEditMarker.images.slice(0, 10);
  }
  document.getElementById('markerId').value = marker.id || '';
  document.getElementById('markerName').value = marker.nome || '';
  document.getElementById('markerDesc').value = '';
  document.getElementById('markerFreq').value = '';
  if (
    marker.tags &&
    marker.tags.length === 1 &&
    marker.tagDetails &&
    marker.tagDetails[marker.tags[0]]
  ) {
    document.getElementById('markerDesc').value =
      marker.tagDetails[marker.tags[0]].descrizione || '';
    document.getElementById('markerFreq').value =
      marker.tagDetails[marker.tags[0]].frequenze || '';
  } else {
    document.getElementById('markerDesc').value = marker.descrizione || '';
    document.getElementById('markerFreq').value = marker.frequenze || '';
  }
  document.getElementById('markerLat').value = marker.lat;
  document.getElementById('markerLng').value = marker.lng;
  if (markerTagContainer) {
    markerTagContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = marker.tags ? marker.tags.includes(cb.value) : false;
    });
  }
  renderTagInputs();
  document.getElementById('markerImages').value = '';
  renderExistingImages();
  modal.classList.add('show');
}

function saveMarker(marker) {
  fetch(`/markers/${marker.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify(marker),
  }).catch((err) => console.error('Update failed', err));
}

function createTagIcon(tags) {
  const colors = (tags || []).map((t) => tagColors[t]).filter(Boolean);
  if (colors.length === 0) {
    colors.push('#3388ff');
  }
  if (colors.length === 1) {
    return L.divIcon({
      className: 'custom-pin',
      html: `<i class="material-icons" style="color:${colors[0]}">place</i>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });
  }
  const step = 100 / colors.length;
  const segments = colors
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(', ');
  const style =
    `background: conic-gradient(${segments});` +
    ' -webkit-background-clip: text;' +
    ' background-clip: text;' +
    ' color: transparent;' +
    ' -webkit-text-fill-color: transparent;' +
    ' text-shadow: none;';
  return L.divIcon({
    className: 'custom-pin',
    html: `<i class="material-icons" style="${style}">place</i>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

function openMarkerView(marker, leafletMarker) {
  document.getElementById('viewTitle').textContent = marker.nome || 'Marker';
  const viewDesc = document.getElementById('viewDesc');
  const viewFreq = document.getElementById('viewFreq');
  viewDesc.textContent = '';
  viewFreq.textContent = '';
  const tags = normalizeTags(marker.tags);
  marker.tags = tags;
  if (tags.length > 1) {
    if (viewTagTabsContainer) viewTagTabsContainer.style.display = 'block';
    viewDesc.style.display = 'none';
    viewFreq.style.display = 'none';
    const existingTabs = M.Tabs.getInstance(viewTagTabs);
    if (existingTabs) existingTabs.destroy();
    viewTagTabs.innerHTML = '';
    viewTagContents.innerHTML = '';
    tags.forEach((tag, i) => {
      const tabId = `viewTab-${i}`;
      const li = document.createElement('li');
      li.className = 'tab';
      li.innerHTML = `<a href="#${tabId}">${tag}</a>`;
      viewTagTabs.appendChild(li);
      const div = document.createElement('div');
      div.id = tabId;
      const info = marker.tagDetails && marker.tagDetails[tag] ? marker.tagDetails[tag] : {};
      const freqText = info.frequenze ? `Frequenze: ${info.frequenze}` : '';
      div.innerHTML = `<p>${info.descrizione || ''}</p><p>${freqText}</p>`;
      viewTagContents.appendChild(div);
    });
    M.Tabs.init(viewTagTabs);
  } else {
    if (viewTagTabsContainer) viewTagTabsContainer.style.display = 'none';
    viewDesc.style.display = '';
    viewFreq.style.display = '';
    const singleTag = tags[0];
    const info =
      marker.tagDetails && singleTag ? marker.tagDetails[singleTag] : null;
    viewDesc.textContent = info ? info.descrizione || '' : marker.descrizione || '';
    viewFreq.textContent = info && info.frequenze
      ? `Frequenze: ${info.frequenze}`
      : marker.frequenze
      ? `Frequenze: ${marker.frequenze}`
      : '';
  }
  document.getElementById('viewLocalita').textContent = marker.localita
    ? `Località: ${marker.localita}`
    : '';
  document.getElementById('viewAutore').textContent = marker.autore
    ? `Inserito da: ${marker.autore}`
    : '';
  document.getElementById('viewTags').textContent = tags.join(', ');
  const carousel = document.getElementById('viewCarousel');
  const existing = M.Carousel.getInstance(carousel);
  if (existing) {
    existing.destroy();
  }
  carousel.innerHTML = '';
  const images = (marker.images || []).slice(0, 10);
  if (images.length) {
    images.forEach((img) => {
      const item = document.createElement('a');
      item.className = 'carousel-item';
      item.innerHTML = `<img src="${img.url}" alt="${img.didascalia || ''}">`;
      if (currentUserRole === 'admin' || currentUserRole === 'editor') {
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Elimina immagine';
        delBtn.className = 'btn red delete-image';
        delBtn.dataset.imageId = img.id;
        item.appendChild(delBtn);
      }
      carousel.appendChild(item);
    });
  }
  const actions = document.getElementById('viewActions');
  actions.innerHTML = '';
  actions.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap; justify-content: flex-end;';
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<i class="material-icons">close</i>Chiudi';
  closeBtn.className = 'btn-modern btn-secondary';
  closeBtn.addEventListener('click', () => markerViewModal.classList.remove('show'));
  actions.appendChild(closeBtn);
  if (currentUserRole === 'admin' || currentUserRole === 'editor') {
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<i class="material-icons">edit</i>Modifica';
    editBtn.className = 'btn-modern btn-primary';
    
    editBtn.addEventListener('click', () => {
      markerViewModal.classList.remove('show');
      openModal(marker);
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="material-icons">delete</i>Elimina pin';
    deleteBtn.className = 'btn-modern btn-danger';
 
    deleteBtn.addEventListener('click', () => {
      if (confirm('Eliminare questo marker?')) {
        fetch(`/markers/${marker.id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        }).then((res) => {
          if (res.ok) {
            markerClusters.removeLayer(leafletMarker);
            delete markersById[marker.id];
            markerViewModal.classList.remove('show');
          }
        });
      }
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
  }
  markerViewModal.classList.add('show');

  if (images.length) {
    M.Carousel.init(carousel, { fullWidth: true, indicators: true });
    carousel.querySelectorAll('.delete-image').forEach((btn) => {
      btn.addEventListener('click', () => {
        const imageId = btn.dataset.imageId;
        if (confirm('Eliminare questa immagine?')) {
          fetch(`/markers/${marker.id}/images/${imageId}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
          }).then((res) => {
            if (res.ok) {
              marker.images = marker.images.filter((img) => String(img.id) !== String(imageId));
              markerViewModal.classList.remove('show');
              openMarkerView(marker, leafletMarker);
            }
          });
        }
      });
    });
  }
}

markerViewModal.addEventListener('click', (e) => {
  if (e.target === markerViewModal) {
    markerViewModal.classList.remove('show');
  }
});

if (annotationModeBtn && annotationOverlay) {
  function clearAnnotation() {
    if (annotationRect) {
      annotationOverlay.removeChild(annotationRect);
      annotationRect = null;
    }
  }

  annotationModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    annotationMode = !annotationMode;
    annotationOverlay.style.display = annotationMode ? 'block' : 'none';
    clearAnnotation();
  });

  annotationOverlay.addEventListener('mousedown', (e) => {
    if (!annotationMode) return;
    annotStartX = e.offsetX;
    annotStartY = e.offsetY;
    annotationRect = document.createElement('div');
    annotationRect.className = 'annotation-rect';
    annotationRect.style.left = `${annotStartX}px`;
    annotationRect.style.top = `${annotStartY}px`;
    annotationOverlay.appendChild(annotationRect);
    annotationOverlay.addEventListener('mousemove', onMouseMove);
  });

  function onMouseMove(e) {
    const x = e.offsetX;
    const y = e.offsetY;
    const left = Math.min(x, annotStartX);
    const top = Math.min(y, annotStartY);
    const width = Math.abs(x - annotStartX);
    const height = Math.abs(y - annotStartY);
    annotationRect.style.left = `${left}px`;
    annotationRect.style.top = `${top}px`;
    annotationRect.style.width = `${width}px`;
    annotationRect.style.height = `${height}px`;
  }

  annotationOverlay.addEventListener('mouseup', async () => {
    if (!annotationMode || !annotationRect) return;
    annotationOverlay.removeEventListener('mousemove', onMouseMove);
    const x = parseInt(annotationRect.style.left);
    const y = parseInt(annotationRect.style.top);
    const w = parseInt(annotationRect.style.width);
    const h = parseInt(annotationRect.style.height);
    const canvas = await html2canvas(document.getElementById('map'), { useCORS: true });
    const dataUrl = canvas.toDataURL('image/png');
    const imgW = canvas.width;
    const imgH = canvas.height;
    const payload = {
      image: dataUrl,
      bbox: {
        x: (x + w / 2) / imgW,
        y: (y + h / 2) / imgH,
        w: w / imgW,
        h: h / imgH,
      },
    };
    fetch('/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((res) => {
      if (!res.ok) {
        alert('Errore salvataggio annotazione');
      } else {
        alert('Annotazione salvata');
      }
    });
    clearAnnotation();
    annotationOverlay.style.display = 'none';
    annotationMode = false;
  });
}
