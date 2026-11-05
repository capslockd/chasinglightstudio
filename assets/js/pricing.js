/* Sessions & Pricing */
const BOOKING_SHEET_URL = "https://script.google.com/macros/s/AKfycbyVOpVMXrp-Z7ZLsfheWmJHLFZgOsFTUJW_uasyH9win_amszTLWXxWgbGSE2iF0ONEAg/exec";
const BOOKING_EMAIL = "moments@chasinglightstudios.com.au";

(function () {
  const SITE = "https://chasinglightstudios.com.au";
  const PAGE = `${SITE}/pricing`;

  // Sessions and packages
  const money = (text) => Number(String(text).replace(/[^0-9.]/g, ""));
  const services = [...document.querySelectorAll(".service[id]")].map((card) => {
    const extraEl = card.querySelector(".pkg-price-extra");
    return {
      id: card.id,
      name: card.querySelector("h2").textContent.trim(),
      schemaName: card.dataset.schemaName || card.querySelector("h2").textContent.trim(),
      packages: [...card.querySelectorAll(".packages li")].map((li) => ({
        hours: li.querySelector(".pkg-hours").textContent.trim(),
        price: li.querySelector(".pkg-price").textContent.trim(),
      })),
      extra: extraEl ? extraEl.textContent.trim() : "",
    };
  });
  const suburbs = [...document.querySelectorAll("#travel .suburb")].map((s) => s.textContent.trim());

  // Structured data
  if (services.length) {
    const areaServed = suburbs.map((name) => ({ "@type": "City", name }));
    const catalog = {
      "@context": "https://schema.org",
      "@type": "OfferCatalog",
      "@id": `${PAGE}#services`,
      name: "Photography sessions",
      url: PAGE,
      itemListElement: services.map((s) => {
        const offers = s.packages.map((p) => ({
          "@type": "Offer",
          name: `${s.schemaName} — ${p.hours}`,
          price: money(p.price).toFixed(2),
          priceCurrency: "AUD",
          url: `${PAGE}#${s.id}`,
        }));
        if (s.extra) {
          offers.push({
            "@type": "Offer",
            name: `${s.schemaName} — extra hour`,
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: money(s.extra).toFixed(2),
              priceCurrency: "AUD",
              unitText: "hour",
            },
            url: `${PAGE}#${s.id}`,
          });
        }
        return {
          "@type": "Service",
          "@id": `${PAGE}#${s.id}`,
          name: s.schemaName,
          serviceType: s.schemaName,
          url: `${PAGE}#${s.id}`,
          provider: { "@id": `${SITE}/#business` },
          areaServed,
          offers,
        };
      }),
    };
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify(catalog);
    document.head.appendChild(ld);
  }

  // Booking request form
  const form = document.getElementById("booking-form");
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const serviceSel = $("bk-service");
  const packageSel = $("bk-package");
  const status = $("bk-status");
  const submit = $("bk-submit");
  const contactInputs = {
    Email: $("bk-email"),
    Phone: $("bk-phone"),
  };

  // Preferred date
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  $("bk-date").min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // Length menu
  function fillPackages() {
    const s = services.find((x) => x.id === serviceSel.value);
    packageSel.innerHTML = "";
    if (!s) {
      packageSel.add(new Option("Choose a session first", ""));
      packageSel.disabled = true;
      packageSel.required = false;
      return;
    }
    packageSel.add(new Option("Choose a length", ""));
    s.packages.forEach((p) => {
      const label = `${p.hours} — ${p.price}`;
      packageSel.add(new Option(label, label));
    });
    if (s.extra) {
      const last = s.packages[s.packages.length - 1];
      const label = `Longer than ${last.hours} (extra hours ${s.extra} each)`;
      packageSel.add(new Option(label, label));
    }
    packageSel.add(new Option("Not sure yet", "Not sure yet"));
    packageSel.disabled = false;
    packageSel.required = true;
  }
  serviceSel.addEventListener("change", fillPackages);
  fillPackages();

  // Session buttons
  document.querySelectorAll("[data-book]").forEach((a) => {
    a.addEventListener("click", () => {
      serviceSel.value = a.dataset.book;
      fillPackages();
      setTimeout(() => $("bk-name").focus({ preventScroll: true }), 0);
    });
  });

  // Contact method
  function syncContact() {
    const chosen = form.elements.contact.value || "Email";
    Object.entries(contactInputs).forEach(([method, input]) => {
      input.required = method === chosen;
      const opt = form.querySelector(`[data-opt-for="${method}"]`);
      if (opt) opt.hidden = method === chosen;
    });
  }
  form.querySelectorAll('input[name="contact"]').forEach((r) => r.addEventListener("change", syncContact));
  syncContact();

  function collect() {
    const v = (name) => (form.elements[name] ? form.elements[name].value.trim() : "");
    const service = services.find((x) => x.id === v("service"));
    return {
      name: v("name"),
      email: v("email"),
      phone: v("phone"),
      contact: v("contact"),
      service: service ? service.name : v("service"),
      package: v("package"),
      date: v("date"),
      suburb: v("suburb"),
      message: v("message"),
      website: v("website"),
      page: location.href.split("#")[0],
    };
  }

  const niceDate = (iso) => {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d) ? iso : d.toLocaleDateString("en-AU",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  function mailtoFor(d) {
    const lines = [
      "Hello,",
      "",
      "I'd like to request a booking.",
      "",
      `Name: ${d.name}`,
      `Email: ${d.email || "—"}`,
      `Phone: ${d.phone || "—"}`,
      `Best way to reach me: ${d.contact}`,
      `Session: ${d.service}`,
      `Length: ${d.package}`,
      `Preferred date: ${niceDate(d.date)}`,
      `Suburb or location: ${d.suburb}`,
    ];
    if (d.message) lines.push("", d.message);
    const subject = `Booking request — ${d.service}, ${d.package} — ${d.name}`;
    return `mailto:${BOOKING_EMAIL}?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(lines.join("\r\n"))}`;
  }

  function show(kind, html) {
    status.className = `form-status is-${kind}`;
    status.innerHTML = html;
    status.hidden = false;
    status.focus({ preventScroll: true });
    status.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const firstName = (n) => esc(n.split(/\s+/)[0] || n);
  const how = (d) => (d.contact === "Phone" ? "phone" : "email");

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = collect();

    if (d.website) {
      form.reset();
      show("ok", "<p>Thank you — your booking request has been sent.</p>");
      return;
    }

    const mailto = mailtoFor(d);

    if (!BOOKING_SHEET_URL) {
      show("ok",
        `<p>Thank you, ${firstName(d.name)}. Your email app should now open with your booking request ` +
        `filled in — just press send, and I'll be in touch by ${how(d)} to confirm.</p>` +
        `<p>If nothing opened, <a href="${esc(mailto)}">tap here to open it again</a>, or email me at ` +
        `<a href="mailto:${BOOKING_EMAIL}">${BOOKING_EMAIL}</a>.</p>`);
      window.location.href = mailto;
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = "Sending…";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(BOOKING_SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(d),
        signal: ctrl.signal,
      });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out || !out.ok) throw new Error((out && out.error) || `HTTP ${res.status}`);
      form.hidden = true;
      form.parentNode.insertBefore(status, form.nextSibling);
      show("ok",
        `<p>Thank you, ${firstName(d.name)} — your booking request is with me.</p>` +
        `<p>I'll be in touch by ${how(d)} to check the date and confirm the details. ` +
        `Nothing is booked until we've spoken.</p>` +
        (out.receipt
          ? `<p>A copy of your request is on its way to <strong>${esc(d.email)}</strong>. ` +
            `If it isn't there in a few minutes, check your junk folder.</p>`
          : ""));
    } catch (err) {
      show("error",
        `<p>Sorry — your request didn't send. Everything you typed is still here, so you can try again.</p>` +
        `<p>Or <a href="${esc(mailto)}">send it by email instead</a> — it opens with your details filled in.</p>`);
    } finally {
      clearTimeout(timer);
      submit.disabled = false;
      submit.textContent = label;
    }
  });
})();
