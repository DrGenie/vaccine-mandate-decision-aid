// script.js

document.addEventListener("DOMContentLoaded", () => {
  // Tab switching
  document.querySelectorAll(".tablink").forEach(btn =>
    btn.addEventListener("click", () => openTab(btn.dataset.tab, btn))
  );
  openTab("introTab", document.querySelector(".tablink.active"));

  // Activate tooltips via title attribute
  document.querySelectorAll(".info-icon").forEach(icon => {
    const txt = icon.dataset.tooltip;
    if (txt) icon.setAttribute("title", txt);
  });
});

function openTab(tabId, btn) {
  document.querySelectorAll(".tabcontent").forEach(sec => sec.style.display = "none");
  document.querySelectorAll(".tablink").forEach(b => b.classList.remove("active"));
  document.getElementById(tabId).style.display = "block";
  btn.classList.add("active");

  if (tabId === "wtslTab") renderWTSLChart();
  if (tabId === "probTab") renderUptakeChart();
  if (tabId === "costsTab") renderCostsBenefits();
}

function getCurrency(country) {
  return country === "Australia" ? "A$" : "€";
}

// ─── Updated EC-Logit Model Coefficients ─────────────────────────────
const vaxCoefficients = {
  scopeAll:        -0.1059746,   // scope2
  exemptionMedRel:  1.387549,    // exempt2
  exemptionAll:     1.210117,    // exempt3
  coverageModerate:-0.5271648,   // cov2
  coverageHigh:    -0.30954,     // cov3
  livesSavedCoeff:  0.1383641    // lives_cont
};
// ────────────────────────────────────────────────────────────────────

const colMultipliers = { Australia:1, France:0.95, Italy:0.9 };
const costParams = {
  Australia:{fixed:200000, variable:50},
  France:   {fixed:180000, variable:45},
  Italy:    {fixed:160000, variable:40}
};
const benefitScenarios = { low:400, medium:500, high:600 };

function computeCostBenefits(country, participants, adjustCOL) {
  const m = adjustCOL==="yes" ? colMultipliers[country] : 1;
  const {fixed, variable} = costParams[country];
  const fixedCost = fixed * m;
  const varCost   = variable * participants * m;
  const totalCost = fixedCost + varCost;
  const benefitPer   = benefitScenarios[document.getElementById("benefitScenario").value];
  const totalBenefit = benefitPer * participants;
  return {
    fixedCost,
    variableCost: varCost,
    totalCost,
    benefitPerParticipant: benefitPer,
    totalBenefit,
    netBenefit: totalBenefit - totalCost
  };
}

function buildScenarioFromInputs() {
  const country   = document.getElementById("country_select")?.value || "Australia";
  const adjustCOL = document.getElementById("adjustCOL")?.value   || "no";

  const scopeAll  = !!document.querySelector('input[name="scope"]:checked');
  const scopeText = scopeAll ? "All occupations & public spaces" : "High-risk occupations only";

  const exVal = document.querySelector('input[name="exemption"]:checked')?.value || "";
  const exemptionText =
    exVal==="medRel" ? "Medical + religious" :
    exVal==="all"    ? "Medical + religious + personal beliefs" :
                       "Medical only";

  const covVal = document.querySelector('input[name="coverage"]:checked')?.value || "";
  const coverageText =
    covVal==="70" ? "70% vaccinated" :
    covVal==="90" ? "90% vaccinated" :
                    "50% vaccinated";

  const lives = parseInt(document.getElementById("livesSaved").value, 10);

  // Utility calculation
  let u = 0;
  if (scopeAll)              u += vaxCoefficients.scopeAll;
  if (exVal==="medRel")       u += vaxCoefficients.exemptionMedRel;
  if (exVal==="all")          u += vaxCoefficients.exemptionAll;
  if (covVal==="70")          u += vaxCoefficients.coverageModerate;
  if (covVal==="90")          u += vaxCoefficients.coverageHigh;
  u += lives * vaxCoefficients.livesSavedCoeff;

  const uptakeProb   = 1 / (1 + Math.exp(-u));
  const uptakePct    = (uptakeProb * 100).toFixed(1);
  const participants = Math.round(uptakeProb * 2000);
  const costs        = computeCostBenefits(country, participants, adjustCOL);

  return {
    country,
    scopeText,
    exemptionText,
    coverageText,
    lives,
    uptakePct,
    participants,
    ...costs
  };
}

function calculateScenario() {
  const s   = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  const html = `
    <h4>Scenario Results</h4>
    <p><strong>Scope:</strong> ${s.scopeText}</p>
    <p><strong>Exemption:</strong> ${s.exemptionText}</p>
    <p><strong>Coverage:</strong> ${s.coverageText}</p>
    <p><strong>Lives Saved:</strong> ${s.lives}</p>
    <p><strong>Uptake:</strong> ${s.uptakePct}%</p>
    <p><strong>Participants:</strong> ${s.participants}</p>
    <p><strong>Net Benefit:</strong> ${cur}${s.netBenefit.toFixed(2)}</p>
  `;
  document.getElementById("modalResults").innerHTML = html;
  document.getElementById("resultModal").style.display = "block";
}
function closeModal() {
  document.getElementById("resultModal").style.display = "none";
}

function showUptakeRecommendations() {
  const s = buildScenarioFromInputs();
  let rec = "<h4>Recommendations</h4>";
  if (s.uptakePct < 40)      rec += "<p><strong>Low uptake:</strong> strengthen incentives & communication.</p>";
  else if (s.uptakePct < 60) rec += "<p><strong>Moderate uptake:</strong> review coverage requirement.</p>";
  else                       rec += "<p><strong>High uptake:</strong> maintain policy and monitor.</p>";
  rec += `<p><strong>Participants:</strong> ${s.participants}</p>`;
  document.getElementById("uptakeResults").innerHTML = rec;
  document.getElementById("uptakeModal").style.display = "block";
}
function closeUptakeModal() {
  document.getElementById("uptakeModal").style.display = "none";
}

let wtslChart, uptakeChart, combinedChart;

function renderWTSLChart() {
  const ctx = document.getElementById("wtslChart").getContext("2d");
  if (wtslChart) wtslChart.destroy();

  // WTSL calculations
  const wtsl70     = -vaxCoefficients.coverageModerate   / vaxCoefficients.livesSavedCoeff;
  const wtsl90     = -vaxCoefficients.coverageHigh       / vaxCoefficients.livesSavedCoeff;
  const wtslScope  = -vaxCoefficients.scopeAll           / vaxCoefficients.livesSavedCoeff;
  const wtslMedRel = -vaxCoefficients.exemptionMedRel    / vaxCoefficients.livesSavedCoeff;
  const wtslAll    = -vaxCoefficients.exemptionAll       / vaxCoefficients.livesSavedCoeff;

  wtslChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [
        "Δ50→70% Coverage",
        "Δ50→90% Coverage",
        "Expand to All Occupations",
        "Med+Rel Exemption",
        "Broad Exemption"
      ],
      datasets: [{
        label: "Lives per 100k needed",
        data: [
          wtsl70.toFixed(2),
          wtsl90.toFixed(2),
          wtslScope.toFixed(2),
          wtslMedRel.toFixed(2),
          wtslAll.toFixed(2)
        ],
        backgroundColor: ["#0074D9","#2ECC40","#FF851B","#B10DC9","#FF4136"]
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Lives per 100k" }
        }
      },
      plugins: {
        title: { display: true, text: "Willingness to Save Lives (WTSL)" }
      }
    }
  });

  document.getElementById("wtslInfo").innerHTML = `
    <p><strong>Intuitive Interpretations:</strong></p>
    <ul>
      <li>Raising coverage from 50% to 70% requires ~<strong>${wtsl70.toFixed(2)}</strong> extra lives per 100k.</li>
      <li>Going from 50% to 90% needs ~<strong>${wtsl90.toFixed(2)}</strong> extra lives.</li>
      <li>Expanding scope to everyone needs ~<strong>${wtslScope.toFixed(2)}</strong> extra lives.</li>
      <li>Allowing medical+religious opt-outs requires ~<strong>${wtslMedRel.toFixed(2)}</strong> extra lives.</li>
      <li>Permitting broad personal-belief exemptions needs ~<strong>${wtslAll.toFixed(2)}</strong> extra lives.</li>
    </ul>
  `;
}

function renderUptakeChart() {
  const s   = buildScenarioFromInputs();
  const ctx = document.getElementById("uptakeChart").getContext("2d");
  if (uptakeChart) uptakeChart.destroy();
  uptakeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Uptake","Non-uptake"],
      datasets: [{
        data: [s.uptakePct, 100 - s.uptakePct],
        backgroundColor: ["#28a745","#dc3545"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: `Uptake Rate: ${s.uptakePct}%` }
      }
    }
  });
}

function renderCostsBenefits() {
  const s   = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  const cb  = computeCostBenefits(s.country, s.participants, document.getElementById("adjustCOL")?.value);

  const container = document.getElementById("costsBenefitsResults");
  container.innerHTML = `
    <div class="card cost-card">
      <h4>Fixed Cost <i class="fa-solid fa-circle-info info-icon" title="Administration, legal, monitoring"></i></h4>
      <p>${cur}${cb.fixedCost.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Variable Cost <i class="fa-solid fa-circle-info info-icon" title="Per-participant time, testing"></i></h4>
      <p>${cur}${cb.variableCost.toFixed(2)}</p>
    </div>
    <div class="card cost-card"><h4>Total Cost</h4><p>${cur}${cb.totalCost.toFixed(2)}</p></div>
    <div class="card cost-card">
      <h4>Total Benefit <i class="fa-solid fa-circle-info info-icon" title="Avoided healthcare costs, QALYs"></i></h4>
      <p>${cur}${cb.totalBenefit.toFixed(2)}</p>
    </div>
    <div class="card cost-card"><h4>Net Benefit</h4><p>${cur}${cb.netBenefit.toFixed(2)}</p></div>
    <div id="combinedChartContainer"><canvas id="combinedChart"></canvas></div>
  `;

  const ctx2 = document.getElementById("combinedChart").getContext("2d");
  if (combinedChart) combinedChart.destroy();
  combinedChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: ["Cost","Benefit","Net"],
      datasets: [{
        label: cur,
        data: [cb.totalCost, cb.totalBenefit, cb.netBenefit],
        backgroundColor: ["#FF4136","#2ECC40","#FFDC00"]
      }]
    },
    options: { responsive: true }
  });
}

// Scenario management
let savedScenarios = [];
function saveScenario() {
  const s = buildScenarioFromInputs();
  s.name = `Scenario ${savedScenarios.length+1}`;
  savedScenarios.push(s);
  const row = document.createElement("tr");
  ["name","scopeText","exemptionText","coverageText","lives","uptakePct","netBenefit"].forEach(key => {
    const td = document.createElement("td");
    td.textContent = key==="netBenefit"
      ? getCurrency(s.country) + s[key].toFixed(2)
      : s[key];
    row.appendChild(td);
  });
  document.querySelector("#scenarioTable tbody").appendChild(row);
  alert(`Saved ${s.name}`);
}

function openComparison() {
  if (savedScenarios.length < 2) return alert("Save at least two scenarios.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(16).text("Scenario Comparison",105,10,{align:"center"});
  savedScenarios.forEach((s,i)=>{
    doc.setFontSize(12).text(`${s.name}`,10,y); y+=6;
    doc.text(`Scope: ${s.scopeText}`,10,y); y+=5;
    doc.text(`Exemption: ${s.exemptionText}`,10,y); y+=5;
    doc.text(`Coverage: ${s.coverageText}`,10,y); y+=5;
    doc.text(`Lives: ${s.lives}`,10,y); y+=5;
    doc.text(`Uptake: ${s.uptakePct}%`,10,y); y+=5;
    doc.text(`Net Benefit: ${getCurrency(s.country)}${s.netBenefit.toFixed(2)}`,10,y); y+=10;
    if (y>260) { doc.addPage(); y=20; }
  });
  doc.save("comparison.pdf");
}

function downloadCSV() {
  if (!savedScenarios.length) return alert("No scenarios saved.");
  let csv = "Name,Scope,Exemption,Coverage,Lives,Uptake%,NetBenefit\n";
  savedScenarios.forEach(s => {
    csv += [
      s.name,
      s.scopeText,
      s.exemptionText,
      s.coverageText,
      s.lives,
      s.uptakePct,
      getCurrency(s.country)+s.netBenefit.toFixed(2)
    ].join(",") + "\n";
  });
  const link = document.createElement("a");
  link.href = encodeURI("data:text/csv;charset=utf-8,"+csv);
  link.download = "scenarios.csv";
  link.click();
}
