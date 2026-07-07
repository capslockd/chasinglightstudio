/* Renders a masonry gallery from a JSON manifest and provides a lightbox. */
(async function () {
  const grid = document.getElementById("gallery");
  if (!grid) return;
  const slug = grid.dataset.slug;

  const res = await fetch(`assets/data/${slug}.json`);
  const photos = await res.json();

  const frag = document.createDocumentFragment();
  photos.forEach((p, i) => {
    const a = document.createElement("a");
    a.href = `assets/img/${slug}/full/${p.n}.webp`;
    a.dataset.index = i;
    const img = document.createElement("img");
    img.dataset.src = `assets/img/${slug}/thumbs/${p.n}.webp`;
    img.alt = "";
    img.style.aspectRatio = `${p.w} / ${p.h}`;
    a.appendChild(img);
    frag.appendChild(a);
  });
  grid.appendChild(frag);

  // Lazy loading
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const img = e.target;
      img.src = img.dataset.src;
      img.onload = () => img.classList.add("loaded");
      io.unobserve(img);
    });
  }, { rootMargin: "400px" });
  grid.querySelectorAll("img").forEach((img) => io.observe(img));

  // Lightbox
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
