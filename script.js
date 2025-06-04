// scriptt.js

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

// ─── EC-Logit Model Estimates ───────────────────────────────────────────────
const vaxCoefficients_pooled = {
  asc3:             1.067346,   // pooled asc3
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
// ────────────────────────────────────────────────────────────────────────────

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
  const country     = document.getElementById("country_select")?.value || "Australia";
  const adjustCOL   = document.getElementById("adjustCOL")?.value   || "no";
  const severityVal = document.getElementById("severitySelect").value; // pooled | mild | severe

  // Choose coefficient set
  let coeffs;
  if (severityVal === "mild") coeffs = vaxCoefficients_mild;
  else if (severityVal === "severe") coeffs = vaxCoefficients_severe;
  else coeffs = vaxCoefficients_pooled;

  const scopeAll    = !!document.querySelector('input[name="scope"]:checked');
  const scopeText   = scopeAll ? "All occupations & public spaces" : "High-risk occupations only";

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

  // Utility = ASC3 + sum(attribute * coef) + lives*livesSavedCoef
  let u = coeffs.asc3;
  if (scopeAll)              u += coeffs.scopeAll;
  if (exVal==="medRel")       u += coeffs.exemptionMedRel;
  if (exVal==="all")          u += coeffs.exemptionAll;
  if (covVal==="70")          u += coeffs.coverageModerate;
  if (covVal==="90")          u += coeffs.coverageHigh;
  u += lives * coeffs.livesSavedCoeff;

  // Uptake probability = exp(u)/(1+exp(u))
  const uptakeProb   = Math.exp(u) / (1 + Math.exp(u));
  const uptakePct    = (uptakeProb * 100).toFixed(1);
  const participants = Math.round(uptakeProb * 2000);
  const costs        = computeCostBenefits(country, participants, adjustCOL);

  return {
    country,
    severity: severityVal.charAt(0).toUpperCase() + severityVal.slice(1),
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
    <p><strong>Severity:</strong> ${s.severity}</p>
    <p><strong>Scope:</strong> ${s.scopeText}</p>
    <p><strong>Exemption:</strong> ${s.exemptionText}</p>
    <p><strong>Coverage:</strong> ${s.coverageText}</p>
    <p><strong>Lives Saved:</strong> ${s.lives}</p>
    <p><strong>Predicted Uptake:</strong> ${s.uptakePct}%</p>
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
  if (s.uptakePct < 40)      rec += "<p><strong>Low uptake:</strong> strengthen communication & incentives.</p>";
  else if (s.uptakePct < 60) rec += "<p><strong>Moderate uptake:</strong> review coverage thresholds.</p>";
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
  // Determine coeffs by severity again
  const severityVal = document.getElementById("severitySelect").value;
  let coeffs;
  if (severityVal === "mild") coeffs = vaxCoefficients_mild;
  else if (severityVal === "severe") coeffs = vaxCoefficients_severe;
  else coeffs = vaxCoefficients_pooled;

  const ctx = document.getElementById("wtslChart").getContext("2d");
  if (wtslChart) wtslChart.destroy();

  // WTSL = –(coef_attr)/(coef_lives)
  const wtsl70     = -coeffs.coverageModerate   / coeffs.livesSavedCoeff;
  const wtsl90     = -coeffs.coverageHigh       / coeffs.livesSavedCoeff;
  const wtslScope  = -coeffs.scopeAll           / coeffs.livesSavedCoeff;
  const wtslMedRel = -coeffs.exemptionMedRel    / coeffs.livesSavedCoeff;
  const wtslAll    = -coeffs.exemptionAll       / coeffs.livesSavedCoeff;

  wtslChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [
        "Δ50→70% Coverage",
        "Δ50→90% Coverage",
        "Expand to All Occupations",
        "Add Med+Rel Exemption",
        "Add Broad Exemption"
      ],
      datasets: [{
        label: "Lives per 100k",
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

  // Intuitive WTSL interpretations
  document.getElementById("wtslInfo").innerHTML = `
    <p><strong>WTSL Interpretations (Severity: ${severityVal.charAt(0).toUpperCase()+severityVal.slice(1)}):</strong></p>
    <ul>
      <li><strong>50→70% Coverage</strong>: needs ~<em>${wtsl70.toFixed(2)}</em> extra lives per 100 000 to compensate.</li>
      <li><strong>50→90% Coverage</strong>: needs ~<em>${wtsl90.toFixed(2)}</em> extra lives.</li>
      <li><strong>Expand to All Occupations</strong>: needs ~<em>${wtslScope.toFixed(2)}</em> extra lives.</li>
      <li><strong>Add Med+Rel Exemption</strong>: 
        ${wtslMedRel >= 0
          ? `needs ~<em>${wtslMedRel.toFixed(2)}</em> extra lives per 100 000.`
          : `no extra lives needed (preferred).`}
      </li>
      <li><strong>Add Broad Exemption</strong>: 
        ${wtslAll >= 0
          ? `needs ~<em>${wtslAll.toFixed(2)}</em> extra lives per 100 000.`
          : `no extra lives needed (preferred).`}
      </li>
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
        title: { display: true, text: `Predicted Uptake: ${s.uptakePct}%` }
      }
    }
  });
}

function renderCostsBenefits() {
  const s    = buildScenarioFromInputs();
  const cur  = getCurrency(s.country);
  const cb   = computeCostBenefits(s.country, s.participants, document.getElementById("adjustCOL")?.value);

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
      <h4>Total Benefit <i class="fa-solid fa-circle-info info-icon" title="Avoided healthcare costs & QALYs"></i></h4>
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
  ["name","severity","scopeText","exemptionText","coverageText","lives","uptakePct","netBenefit"].forEach(key => {
    const td = document.createElement("td");
    td.textContent = (key==="netBenefit")
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
  savedScenarios.forEach(s=>{
    doc.setFontSize(12).text(`${s.name} (Severity: ${s.severity})`,10,y); y+=6;
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
  let csv = "Name,Severity,Scope,Exemption,Coverage,Lives,Uptake%,NetBenefit\n";
  savedScenarios.forEach(s => {
    csv += [
      s.name,
      s.severity,
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
