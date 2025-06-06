// scrippt.js

// Event listener for DOM content loaded
document.addEventListener("DOMContentLoaded", () => {
  // Tab switching
  document.querySelectorAll(".tablink").forEach(btn =>
    btn.addEventListener("click", () => openTab(btn.dataset.tab, btn))
  );
  openTab("introTab", document.querySelector(".tablink.active"));

  // Activate tooltips via title attribute
  document.querySelectorAll(".info-icon").forEach(icon => {
    const txt = icon.dataset.tooltip || icon.getAttribute("title");
    if (txt) icon.setAttribute("title", txt);
  });

  // Load cost parameters from JSON file
  window.costParams = {};
  fetch('cost_params.json')
    .then(response => response.json())
    .then(data => {
      window.costParams = data;
    })
    .catch(error => console.error('Error loading cost parameters:', error));
});

// Tab switching function with fade-in effect
function openTab(tabId, btn) {
  document.querySelectorAll(".tabcontent").forEach(sec => {
    sec.classList.remove("active");
    sec.style.display = "none";
  });
  document.querySelectorAll(".tablink").forEach(b => b.classList.remove("active"));
  const tabContent = document.getElementById(tabId);
  tabContent.style.display = "block";
  setTimeout(() => {
    tabContent.classList.add("active");
  }, 10);
  btn.classList.add("active");
  if (tabId === "wtslTab") renderWTSLChart();
  if (tabId === "probTab") renderUptakeChart();
  if (tabId === "costsTab") renderCostsBenefits();
}

// Utility function to get currency symbol
function getCurrency(country) {
  return country === "Australia" ? "A$" : "€";
}

// error-logit coefficients for different severity levels
const vaxCoefficients_pooled = {
  asc3:             1.067346,
  scopeAll:        -0.094717,
  exemptionMedRel: -0.052939,
  exemptionAll:    -0.1479027,
  coverageModerate: 0.0929465,
  coverageHigh:     0.0920977,
  livesSavedCoeff:  0.0445604
};
const vaxCoefficients_mild = {
  asc3:             0.9855033,
  scopeAll:        -0.1689361,
  exemptionMedRel: -0.0376554,
  exemptionAll:    -0.1753159,
  coverageModerate: 0.1245323,
  coverageHigh:     0.0662936,
  livesSavedCoeff:  0.0412682
};
const vaxCoefficients_severe = {
  asc3:             1.154312,
  scopeAll:        -0.0204815,
  exemptionMedRel: -0.0681409,
  exemptionAll:    -0.1219056,
  coverageModerate: 0.0610344,
  coverageHigh:     0.116988,
  livesSavedCoeff:  0.0480637
};

// Cost-of-living multipliers
const colMultipliers = { Australia: 1, France: 0.95, Italy: 0.9 };

// QALY benefit scenarios
const benefitScenarios = {
  low:    { AUS: 40000, EUR: 35000 },
  medium: { AUS: 50000, EUR: 45000 },
  high:   { AUS: 60000, EUR: 55000 }
};

// Compute cost-benefit details
function computeCostBenefits(country, participants, livesSavedPer100k, benefitScenario, adjustCOL) {
  const m = adjustCOL === "yes" ? colMultipliers[country] : 1;
  let fixedCostSum = 0;
  for (const key in window.costParams[country].fixed) {
    fixedCostSum += window.costParams[country].fixed[key];
  }
  fixedCostSum *= m;
  const varCost = window.costParams[country].variablePerPerson * participants * m;
  const totalCost = fixedCostSum + varCost;
  const totalLives = (livesSavedPer100k / 100000) * 322;
  const QALYsPerLife = 10;
  const totalQALYs = totalLives * QALYsPerLife;
  const currencyKey = country === "Australia" ? "AUS" : "EUR";
  const valuePerQALY = benefitScenarios[benefitScenario][currencyKey];
  const totalBenefit = totalQALYs * valuePerQALY;
  const netBenefit = totalBenefit - totalCost;
  return { fixedCost: fixedCostSum, variableCost: varCost, totalCost, totalLives, QALYsPerLife, totalQALYs, valuePerQALY, totalBenefit, netBenefit };
}

// Build scenario object from user inputs
function buildScenarioFromInputs() {
  const country = document.getElementById("country_select").value || "Australia";
  const adjustCOL = document.getElementById("adjustCOL")?.value || "no";
  const severityVal = document.getElementById("severitySelect").value;
  let coeffs = severityVal === "mild" ? vaxCoefficients_mild : severityVal === "severe" ? vaxCoefficients_severe : vaxCoefficients_pooled;

  const scopeAll = !!document.querySelector('input[name="scope"]:checked');
  const scopeText = scopeAll ? "All occupations & public spaces" : "High-risk occupations only";

  const exVal = document.querySelector('input[name="exemption"]:checked')?.value || "";
  const exemptionText = exVal === "medRel" ? "Medical + religious" : exVal === "all" ? "Medical + religious + personal beliefs" : "Medical only";

  const covVal = document.querySelector('input[name="coverage"]:checked')?.value || "";
  const coverageText = covVal === "70" ? "70% vaccinated" : covVal === "90" ? "90% vaccinated" : "50% vaccinated";

  const livesSaved = parseInt(document.getElementById("livesSaved").value, 10);

  let u = coeffs.asc3;
  if (scopeAll) u += coeffs.scopeAll;
  if (exVal === "medRel") u += coeffs.exemptionMedRel;
  if (exVal === "all") u += coeffs.exemptionAll;
  if (covVal === "70") u += coeffs.coverageModerate;
  if (covVal === "90") u += coeffs.coverageHigh;
  u += livesSaved * coeffs.livesSavedCoeff;

  const uptakeProb = Math.exp(u) / (1 + Math.exp(u));
  const uptakePct = (uptakeProb * 100).toFixed(1);
  const participants = Math.round(uptakeProb * 322);
  const benefitScenario = document.getElementById("benefitScenario").value;
  const cbData = computeCostBenefits(country, participants, livesSaved, benefitScenario, adjustCOL);

  return { country, severity: severityVal.charAt(0).toUpperCase() + severityVal.slice(1), scopeText, exemptionText, coverageText, livesSaved, uptakePct, participants, ...cbData };
}

// Display scenario results in a modal
function calculateScenario() {
  const s = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  const html = `
    <h4>Scenario Results</h4>
    <p><strong>Country:</strong> ${s.country}</p>
    <p><strong>Severity:</strong> ${s.severity}</p>
    <p><strong>Scope:</strong> ${s.scopeText}</p>
    <p><strong>Exemption:</strong> ${s.exemptionText}</p>
    <p><strong>Coverage:</strong> ${s.coverageText}</p>
    <p><strong>Lives Saved (per 100k):</strong> ${s.livesSaved}</p>
    <p><strong>Predicted Uptake:</strong> ${s.uptakePct}%</p>
    <p><strong>Participants (out of 322):</strong> ${s.participants}</p>
    <p><strong>Total QALYs Saved:</strong> ${s.totalQALYs.toFixed(2)}</p>
    <p><strong>Total Benefit:</strong> ${cur}${s.totalBenefit.toFixed(2)}</p>
    <p><strong>Total Cost:</strong> ${cur}${s.totalCost.toFixed(2)}</p>
    <p><strong>Net Benefit:</strong> ${cur}${s.netBenefit.toFixed(2)}</p>
  `;
  document.getElementById("modalResults").innerHTML = html;
  document.getElementById("resultModal").style.display = "block";
}

function closeModal() {
  document.getElementById("resultModal").style.display = "none";
}

// Show dynamic uptake recommendations
function showUptakeRecommendations() {
  const s = buildScenarioFromInputs();
  let rec = "<h4>Recommendations</h4>";
  if (s.uptakePct < 40) rec += "<p><strong>Low uptake:</strong> Consider stronger communication strategies, increase incentives, and review exemption criteria to boost acceptance.</p>";
  else if (s.uptakePct < 60) rec += "<p><strong>Moderate uptake:</strong> Fine-tune coverage thresholds, consider modest incentives, and monitor compliance closely.</p>";
  else rec += "<p><strong>High uptake:</strong> Current policy appears effective. Maintain efforts, but continue monitoring for potential adjustments.</p>";
  rec += `<p><strong>Participants (out of 322):</strong> ${s.participants}</p>`;
  document.getElementById("uptakeResults").innerHTML = rec;
  document.getElementById("uptakeModal").style.display = "block";
}

function closeUptakeModal() {
  document.getElementById("uptakeModal").style.display = "none";
}

// Render WTSL chart
let wtslChart;
function renderWTSLChart() {
  const severityVal = document.getElementById("severitySelect").value;
  let coeffs = severityVal === "mild" ? vaxCoefficients_mild : severityVal === "severe" ? vaxCoefficients_severe : vaxCoefficients_pooled;
  const ctx = document.getElementById("wtslChart").getContext("2d");
  if (wtslChart) wtslChart.destroy();
  const wtsl70 = -coeffs.coverageModerate / coeffs.livesSavedCoeff;
  const wtsl90 = -coeffs.coverageHigh / coeffs.livesSavedCoeff;
  const wtslScope = -coeffs.scopeAll / coeffs.livesSavedCoeff;
  const wtslMedRel = -coeffs.exemptionMedRel / coeffs.livesSavedCoeff;
  const wtslAll = -coeffs.exemptionAll / coeffs.livesSavedCoeff;
  wtslChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Δ50→70% Coverage", "Δ50→90% Coverage", "Expand to All Occupations", "Add Med+Rel Exemption", "Add Broad Exemption"],
      datasets: [{
        label: "Lives/100k",
        data: [wtsl70.toFixed(2), wtsl90.toFixed(2), wtslScope.toFixed(2), wtslMedRel.toFixed(2), wtslAll.toFixed(2)],
        backgroundColor: ["#1565C0", "#2E7D32", "#F9A825", "#6A1B9A", "#C62828"],
        borderColor: ["#0D47A1", "#1B5E20", "#F57F17", "#4A148C", "#B71C1C"],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, title: { display: true, text: "Lives per 100,000" } } },
      plugins: {
        title: { display: true, text: `Willingness to Save Lives (WTSL) – ${severityVal.charAt(0).toUpperCase() + severityVal.slice(1)}` },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} lives` } }
      }
    }
  });
  document.getElementById("wtslInfo").innerHTML = `
    <p><strong>WTSL Interpretations (Severity: ${severityVal.charAt(0).toUpperCase() + severityVal.slice(1)}):</strong></p>
    <ul>
      <li><strong>Coverage 50→70%:</strong> Needs ~<em>${wtsl70.toFixed(2)}</em> extra lives per 100,000 to justify raising threshold.</li>
      <li><strong>Coverage 50→90%:</strong> Needs ~<em>${wtsl90.toFixed(2)}</em> extra lives per 100,000.</li>
      <li><strong>Expand to All Occupations:</strong> Needs ~<em>${wtslScope.toFixed(2)}</em> extra lives per 100,000.</li>
      <li><strong>Add Med+Rel Exemption:</strong> ${wtslMedRel >= 0 ? `Needs ~<em>${wtslMedRel.toFixed(2)}</em> extra lives per 100,000.` : `No extra lives needed (preferred).`}</li>
      <li><strong>Add Broad Exemption:</strong> ${wtslAll >= 0 ? `Needs ~<em>${wtslAll.toFixed(2)}</em> extra lives per 100,000.` : `No extra lives needed (preferred).`}</li>
    </ul>
  `;
}

// Render uptake chart
let uptakeChart;
function renderUptakeChart() {
  const s = buildScenarioFromInputs();
  const ctx = document.getElementById("uptakeChart").getContext("2d");
  if (uptakeChart) uptakeChart.destroy();
  uptakeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Uptake", "Non-uptake"],
      datasets: [{ data: [s.uptakePct, 100 - s.uptakePct], backgroundColor: ["#2E7D32", "#C62828"], borderColor: ["#1B5E20", "#B71C1C"], borderWidth: 1 }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: `Predicted Uptake: ${s.uptakePct}% (n=322)` },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}%` } }
      }
    }
  });
}

// Render costs and benefits
let combinedChart;
function renderCostsBenefits() {
  const s = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  const cb = computeCostBenefits(s.country, s.participants, s.livesSaved, document.getElementById("benefitScenario").value, document.getElementById("adjustCOL")?.value);
  const container = document.getElementById("costsBenefitsResults");
  container.innerHTML = `
    <div class="card cost-card">
      <h4>Fixed Cost Components <i class="fa-solid fa-circle-info info-icon" title="Infrastructure, legal, communication, monitoring"></i></h4>
      <p><strong>Vaccine Procurement:</strong> ${cur}${window.costParams[s.country].fixed.vaccineProcurement.toFixed(2)}</p>
      <p><strong>Administration & Staffing:</strong> ${cur}${window.costParams[s.country].fixed.administration.toFixed(2)}</p>
      <p><strong>Legal & Compliance:</strong> ${cur}${window.costParams[s.country].fixed.legal.toFixed(2)}</p>
      <p><strong>Communication & Outreach:</strong> ${cur}${window.costParams[s.country].fixed.communication.toFixed(2)}</p>
      <p><strong>Monitoring & Data Systems:</strong> ${cur}${window.costParams[s.country].fixed.monitoring.toFixed(2)}</p>
      <p><strong>Total Fixed Cost:</strong> ${cur}${cb.fixedCost.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Variable Cost Components <i class="fa-solid fa-circle-info info-icon" title="Time lost, testing, outreach per participant"></i></h4>
      <p><strong>Per Participant Cost:</strong> ${cur}${window.costParams[s.country].variablePerPerson.toFixed(2)}</p>
      <p><strong># Participants:</strong> ${s.participants}</p>
      <p><strong>Total Variable Cost:</strong> ${cur}${cb.variableCost.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Benefit Components (QALY-Based) <i class="fa-solid fa-circle-info info-icon" title="Estimated QALYs and monetary value"></i></h4>
      <p><strong>Total Lives Saved:</strong> ${cb.totalLives.toFixed(3)}</p>
      <p><strong>QALYs per Life:</strong> 10</p>
      <p><strong>Total QALYs Gained:</strong> ${cb.totalQALYs.toFixed(1)}</p>
      <p><strong>Value per QALY:</strong> ${cur}${cb.valuePerQALY.toLocaleString()}</p>
      <p><strong>Total Benefit:</strong> ${cur}${cb.totalBenefit.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Net Benefit</h4>
      <p><strong>Total Cost:</strong> ${cur}${cb.totalCost.toFixed(2)}</p>
      <p><strong>Total Benefit:</strong> ${cur}${cb.totalBenefit.toFixed(2)}</p>
      <p><strong>Net Benefit:</strong> <span class="${cb.netBenefit >= 0 ? 'positive' : 'negative'}">${cur}${cb.netBenefit.toFixed(2)}</span></p>
    </div>
    <div id="combinedChartContainer"><canvas id="combinedChart"></canvas></div>
  `;
  const ctx2 = document.getElementById("combinedChart").getContext("2d");
  if (combinedChart) combinedChart.destroy();
  combinedChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: ["Fixed Cost", "Variable Cost", "Total Benefit", "Net Benefit"],
      datasets: [{
        label: cur,
        data: [cb.fixedCost, cb.variableCost, cb.totalBenefit, cb.netBenefit],
        backgroundColor: ["#EF5350", "#FFA726", "#66BB6A", "#42A5F5"],
        borderColor: ["#D32F2F", "#F57F17", "#388E3C", "#0288D1"],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, title: { display: true, text: "Amount" } } },
      plugins: {
        title: { display: true, text: "Cost-Benefit Summary" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}

// Save scenario to table
let savedScenarios = [];
function saveScenario() {
  const s = buildScenarioFromInputs();
  s.name = `Scenario ${savedScenarios.length + 1}`;
  savedScenarios.push(s);
  const row = document.createElement("tr");
  ["name", "severity", "scopeText", "exemptionText", "coverageText", "livesSaved", "uptakePct", "netBenefit"].forEach(key => {
    const td = document.createElement("td");
    td.textContent = key === "netBenefit" ? getCurrency(s.country) + s[key].toFixed(2) : s[key];
    row.appendChild(td);
  });
  document.querySelector("#scenarioTable tbody").appendChild(row);
  alert(`Saved ${s.name}`);
}

// Export scenarios to PDF
function openComparison() {
  if (savedScenarios.length < 2) return alert("Save at least two scenarios.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(16).text("Scenario Comparison", 105, 10, { align: "center" });
  savedScenarios.forEach(s => {
    doc.setFontSize(12).text(`${s.name} (Severity: ${s.severity})`, 10, y); y += 6;
    doc.text(`Scope: ${s.scopeText}`, 10, y); y += 5;
    doc.text(`Exemption: ${s.exemptionText}`, 10, y); y += 5;
    doc.text(`Coverage: ${s.coverageText}`, 10, y); y += 5;
    doc.text(`Lives Saved: ${s.livesSaved}`, 10, y); y += 5;
    doc.text(`Uptake: ${s.uptakePct}%`, 10, y); y += 5;
    doc.text(`Net Benefit: ${getCurrency(s.country)}${s.netBenefit.toFixed(2)}`, 10, y); y += 10;
    if (y > 260) { doc.addPage(); y = 20; }
  });
  doc.save("Scenarios_Comparison.pdf");
}

// Download scenarios as CSV
function downloadCSV() {
  if (!savedScenarios.length) return alert("No scenarios saved.");
  let csv = "Name,Severity,Scope,Exemption,Coverage,Lives,Uptake%,NetBenefit\n";
  savedScenarios.forEach(s => {
    csv += [s.name, s.severity, s.scopeText, s.exemptionText, s.coverageText, s.livesSaved, s.uptakePct, getCurrency(s.country) + s.netBenefit.toFixed(2)].join(",") + "\n";
  });
  const link = document.createElement("a");
  link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
  link.download = "scenarios.csv";
  link.click();
}

// Load preset scenarios
function loadPreset(type) {
  const presets = {
    current: { scope: "", exemption: "", coverage: "", livesSaved: 25, severity: "pooled", country: "Australia", benefitScenario: "medium" },
    expanded: { scope: "all", exemption: "medRel", coverage: "70", livesSaved: 30, severity: "severe", country: "France", benefitScenario: "high" },
    relaxed: { scope: "", exemption: "all", coverage: "90", livesSaved: 20, severity: "mild", country: "Italy", benefitScenario: "low" }
  };
  const preset = presets[type];
  document.getElementById("severitySelect").value = preset.severity;
  document.querySelector('input[name="scope"]').checked = preset.scope === "all";
  document.querySelectorAll('input[name="exemption"]').forEach(input => input.checked = input.value === preset.exemption);
  document.querySelectorAll('input[name="coverage"]').forEach(input => input.checked = input.value === preset.coverage);
  document.getElementById("livesSaved").value = preset.livesSaved;
  document.getElementById("livesSavedValue").textContent = preset.livesSaved;
  document.getElementById("country_select").value = preset.country;
  document.getElementById("benefitScenario").value = preset.benefitScenario;
}

// Reset inputs to default
function resetInputs() {
  document.getElementById("severitySelect").value = "pooled";
  document.querySelectorAll('input[name="scope"]').forEach(input => input.checked = false);
  document.querySelectorAll('input[name="exemption"]').forEach(input => input.checked = false);
  document.querySelectorAll('input[name="coverage"]').forEach(input => input.checked = false);
  document.getElementById("livesSaved").value = 25;
  document.getElementById("livesSavedValue").textContent = 25;
  document.getElementById("country_select").value = "Australia";
  document.getElementById("benefitScenario").value = "medium";
}
