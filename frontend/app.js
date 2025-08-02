const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

fetch('/markers')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then((markers) => {
    markers.forEach((marker) => {
      const popupContent = createPopupContent(marker);
      L.marker([marker.lat, marker.lng]).addTo(map).bindPopup(popupContent);
    });
  })
  .catch((err) => {
    console.error('Failed to load markers', err);
  });

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
      html += `<img src="${img.url}" ${caption}>`;
    });
    html += '</div>';
  }
  return html;
}
