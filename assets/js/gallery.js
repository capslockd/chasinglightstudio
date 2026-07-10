/* Renders a masonry gallery from a JSON manifest, with optional password gate,
   highlights mode, lazy loading and a lightbox. Photos are ordered by filename
   and placed left-to-right into the currently shortest column, so reading order
   follows the file order. */
(async function () {
  const grid = document.getElementById("gallery");
  if (!grid) return;
  const slug = grid.dataset.slug;

  // ---------- Password gate (client-side; keeps casual visitors out) ----------
  const gateHash = grid.dataset.protect;
  if (gateHash && sessionStorage.getItem(`gate-${slug}`) !== gateHash) {
    const ok = await new Promise((resolve) => {
      const gate = document.createElement("div");
      gate.className = "gate";
      gate.innerHTML = `
        <div class="gate-box">
          <h3>Private Gallery</h3>
          <p>This album is password protected.<br>Please enter the password to view the photos.</p>
          <form>
            <input type="password" placeholder="Password" autocomplete="off" autofocus>
            <button type="submit">Enter</button>
          </form>
          <div class="gate-error"></div>
        </div>`;
      document.body.appendChild(gate);
      const input = gate.querySelector("input");
      const err = gate.querySelector(".gate-error");
      gate.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const buf = await crypto.subtle.digest("SHA-256",
          new TextEncoder().encode(input.value));
        const hex = [...new Uint8Array(buf)]
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        if (hex === gateHash) {
          sessionStorage.setItem(`gate-${slug}`, gateHash);
          gate.remove();
          resolve(true);
        } else {
          err.textContent = "Incorrect password — please try again.";
          input.value = "";
          input.focus();
        }
      });
    });
    if (!ok) return;
  }

  // ---------- Load manifest ----------
  const res = await fetch(`assets/data/${slug}.json`);
  let photos = await res.json();
  photos.sort((a, b) => a.n.localeCompare(b.n));
  const total = photos.length;

  // Highlights mode: show a curated subset unless ?all is in the URL.
  const showAll = new URLSearchParams(location.search).has("all");
  const toggle = document.getElementById("gallery-toggle");
  if (!showAll) {
    try {
      const hl = await (await fetch(`assets/data/${slug}-highlights.json`)).json();
      const set = new Set(hl);
      photos = photos.filter((p) => set.has(p.n));
      if (toggle) toggle.innerHTML =
        `Showing ${photos.length} highlights &mdash; <a href="?all">view all ${total} photos</a>`;
    } catch (e) { /* no highlights file: show everything */ }
  } else if (toggle) {
    toggle.innerHTML =
      `Showing all ${total} photos &mdash; <a href="${location.pathname}">view highlights</a>`;
  }

  // ---------- Masonry: shortest-column placement keeps filename order ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const img = e.target;
      img.src = img.dataset.src;
      img.onload = () => img.classList.add("loaded");
      io.unobserve(img);
    });
  }, { rootMargin: "400px" });

  function columnCount() {
    return Math.max(1, Math.min(4, Math.floor(grid.clientWidth / 280)));
  }

  let currentCols = 0;
  function build() {
    const n = columnCount();
    if (n === currentCols) return;
    currentCols = n;
    io.disconnect();
    grid.innerHTML = "";
    const cols = [];
    const heights = [];
    for (let c = 0; c < n; c++) {
      const col = document.createElement("div");
      col.className = "masonry-col";
      grid.appendChild(col);
      cols.push(col);
      heights.push(0);
    }
    photos.forEach((p, i) => {
      const c = heights.indexOf(Math.min(...heights));
      const a = document.createElement("a");
      a.href = `assets/img/${slug}/full/${p.n}.webp`;
      a.dataset.index = i;
      a.draggable = false;
      const img = document.createElement("img");
      img.dataset.src = `assets/img/${slug}/thumbs/${p.n}.webp`;
      img.alt = "";
      img.draggable = false;
      img.style.aspectRatio = `${p.w} / ${p.h}`;
      a.appendChild(img);
      cols[c].appendChild(a);
      heights[c] += p.h / p.w;
      io.observe(img);
    });
  }
  build();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  // ---------- Lightbox ----------
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = `
    <button class="lb-close" aria-label="Close">&times;</button>
    <button class="lb-prev" aria-label="Previous">&#8249;</button>
    <img alt="">
    <button class="lb-next" aria-label="Next">&#8250;</button>
    <div class="lb-count"></div>`;
  document.body.appendChild(lb);
  const lbImg = lb.querySelector("img");
  const lbCount = lb.querySelector(".lb-count");
  let current = 0;

  function show(i) {
    current = (i + photos.length) % photos.length;
    lbImg.src = `assets/img/${slug}/full/${photos[current].n}.webp`;
    lbCount.textContent = `${current + 1} / ${photos.length}`;
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function close() {
    lb.classList.remove("open");
    lbImg.src = "";
    document.body.style.overflow = "";
  }

  // Deter casual "Save Image As" via right-click / drag on the photos.
  grid.addEventListener("contextmenu", (e) => {
    if (e.target.closest("img, a")) e.preventDefault();
  });
  lb.addEventListener("contextmenu", (e) => {
    if (e.target.closest("img")) e.preventDefault();
  });
  grid.addEventListener("dragstart", (e) => {
    if (e.target.closest("img, a")) e.preventDefault();
  });
  lb.addEventListener("dragstart", (e) => {
    if (e.target.closest("img")) e.preventDefault();
  });

  grid.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    show(Number(a.dataset.index));
  });
  lb.querySelector(".lb-close").addEventListener("click", close);
  lb.querySelector(".lb-prev").addEventListener("click", () => show(current - 1));
  lb.querySelector(".lb-next").addEventListener("click", () => show(current + 1));
  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });

  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  // Swipe support
  let touchX = null;
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });
})();
